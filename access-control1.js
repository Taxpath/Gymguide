/* =========================================================
   CMA MCQ PORTAL — ACCESS CONTROL
   Test Site: Business Law & Ethics

   FREE MODE:
   - Fixed 30 MCQ Bank questions
   - Question IDs: 1 to 30
   - Same questions can be attempted repeatedly
   - No lifetime usage limit
   - No random order
   - No timer
   - No chapter selection
   - No PYQ
   - No bookmarks
   - No reattempt-wrong
   - Instant answer ON

   PAID MODE:
   - Existing subject functionality remains available
   - This file only tells the subject page whether the
     current user is FREE or PAID.

   IMPORTANT:
   This is client-side access control. Paid-content security
   should ultimately also be enforced through Firebase rules
   / server-side validation.
========================================================= */

(function () {
  "use strict";

  /* =========================================================
     CENTRAL SETTINGS
     Change FREE_MCQ_LIMIT here later if you want 30 -> 50.
  ========================================================= */
  const FREE_MCQ_LIMIT = 30;

  /*
     Fixed free question IDs.

     Current Business Law & Ethics test file contains:
       Q1 to Q30

     Therefore the first 30 MCQ Bank questions are the
     fixed free pool.
  */
  const FREE_MCQ_IDS = Array.from(
    { length: FREE_MCQ_LIMIT },
    (_, i) => i + 1
  );

  const ADMIN_EMAIL = "taxxpath@gmail.com";

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA7tGvsDYyYLSWFPeS6lsxlP8gLOw53Wrk",
    authDomain: "cma-mcq-portal.firebaseapp.com",
    projectId: "cma-mcq-portal",
    storageBucket: "cma-mcq-portal.firebasestorage.app",
    messagingSenderId: "734935438365",
    appId: "1:734935438365:web:40ea0a7677ef572234a2f4",
    measurementId: "G-H6GDK7Y3RJ"
  };

  /* =========================================================
     FIREBASE INITIALIZATION
  ========================================================= */
  function initFirebase() {
    if (typeof firebase === "undefined") {
      console.error("Firebase SDK is not loaded.");
      return false;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    return true;
  }

  initFirebase();

  const auth =
    typeof firebase !== "undefined" && firebase.auth
      ? firebase.auth()
      : null;

  const db =
    typeof firebase !== "undefined" && firebase.firestore
      ? firebase.firestore()
      : null;

  /* =========================================================
     HELPERS
  ========================================================= */
  function normaliseEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function isExpired(dateValue) {
    if (!dateValue) return false;

    /*
      Expected format from the existing portal:
      YYYY-MM-DD
    */
    const expiry = String(dateValue).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      return false;
    }

    return expiry < new Date().toISOString().slice(0, 10);
  }

  function hasPaidGroupAccess(data) {
    if (!data) return false;

    return [
      data.accessFoundation,
      data.accessInterGroup1,
      data.accessInterGroup2,
      data.accessFinalGroup3,
      data.accessFinalGroup4
    ].some(Boolean);
  }

  /* =========================================================
     GET CURRENT ACCESS STATUS

     Returns:

     {
       mode: "admin" | "paid" | "free",
       isFree: true/false,
       isPaid: true/false,
       isAdmin: true/false,
       data: Firebase approvedUsers data
     }
  ========================================================= */
  function waitForAuthReady() {
    return new Promise(function(resolve) {
      if (!auth) {
        resolve(null);
        return;
      }

      if (auth.currentUser) {
        resolve(auth.currentUser);
        return;
      }

      let finished = false;
      let unsubscribe = null;

      try {
        unsubscribe = auth.onAuthStateChanged(function(user) {
          if (finished) return;
          finished = true;
          try { if (unsubscribe) unsubscribe(); } catch (e) {}
          resolve(user || null);
        });
      } catch (e) {
        resolve(auth.currentUser || null);
        return;
      }

      setTimeout(function() {
        if (finished) return;
        finished = true;
        try { if (unsubscribe) unsubscribe(); } catch (e) {}
        resolve(auth.currentUser || null);
      }, 5000);
    });
  }

  async function getAccessStatus() {
    const user = await waitForAuthReady();

    if (!user) {
      return {
        mode: "free",
        isFree: true,
        isPaid: false,
        isAdmin: false,
        signedIn: false,
        data: null
      };
    }

    const email = normaliseEmail(user.email);

    /* ADMIN = FULL ACCESS */
    if (email === ADMIN_EMAIL) {
      return {
        mode: "admin",
        isFree: false,
        isPaid: true,
        isAdmin: true,
        signedIn: true,
        data: {
          role: "admin"
        }
      };
    }

    /* APPROVED USER CHECK FIRST
       An explicit revoked/inactive record always takes precedence,
       including when Global Student Portal Access is temporarily open. */
    let approvedData = null;
    let approvedRecordExists = false;

    try {
      if (db && email) {
        const ref = await db.collection("approvedUsers").doc(email).get();

        if (ref.exists) {
          approvedRecordExists = true;
          approvedData = ref.data() || {};

          const status = String(
            approvedData.status || "active"
          ).toLowerCase();

          const expired = isExpired(approvedData.expiryDate);

          // Explicitly revoked/inactive/expired = FREE mode.
          if (
            approvedData.revoked === true ||
            status !== "active" ||
            expired
          ) {
            return {
              mode: "free",
              isFree: true,
              isPaid: false,
              isAdmin: false,
              signedIn: true,
              data: approvedData
            };
          }

          // Normal paid access for an active approved student.
          if (hasPaidGroupAccess(approvedData)) {
            return {
              mode: "paid",
              isFree: false,
              isPaid: true,
              isAdmin: false,
              signedIn: true,
              data: approvedData
            };
          }
        }
      }
    } catch (error) {
      console.warn("Subscription access check failed:", error);
    }

    /* GLOBAL OPEN ACCESS = FULL ACCESS
       Only applies when the student does not have an explicit
       revoked/inactive/expired approvedUsers record. */
    try {
      if (db) {
        const globalRef = await db.doc("settings/globalAccess").get();

        if (
          globalRef.exists &&
          globalRef.data() &&
          globalRef.data().studentAccessOpen === true
        ) {
          return {
            mode: "paid",
            isFree: false,
            isPaid: true,
            isAdmin: false,
            globalOpen: true,
            signedIn: true,
            data: globalRef.data()
          };
        }
      }
    } catch (error) {
      console.warn("Global access check failed:", error);
    }

    /*
       Everyone else who is signed in gets FREE MODE.

       IMPORTANT:
       No localStorage usage counter is used here.
       Therefore the same 30 questions can be repeated
       every time.
    */
    return {
      mode: "free",
      isFree: true,
      isPaid: false,
      isAdmin: false,
      signedIn: true,
      data: null
    };
  }

  /* =========================================================
     FIXED FREE QUESTION FILTER

     Use this in the subject page:

       const access = await CMAAccess.getAccessStatus();

       if (access.isFree) {
         questions = CMAAccess.getFreeQuestions(QUESTIONS);
       }
  ========================================================= */
  function getFreeQuestions(questions) {
    if (!Array.isArray(questions)) return [];

    const allowed = new Set(FREE_MCQ_IDS);

    return questions.filter(function (question) {
      return (
        question &&
        question.source === "bank" &&
        allowed.has(Number(question.id))
      );
    });
  }

  /* =========================================================
     CHECK WHETHER A QUESTION IS IN THE FREE POOL
  ========================================================= */
  function isFreeQuestion(question) {
    if (!question) return false;

    return (
      question.source === "bank" &&
      FREE_MCQ_IDS.includes(Number(question.id))
    );
  }

  /* =========================================================
     FREE MODE CONFIGURATION

     Subject page can use this to force the required settings.
  ========================================================= */
  function getFreeConfig() {
    return {
      questions: FREE_MCQ_LIMIT,
      random: false,
      timer: "off",
      instant: true,
      chapter: "all",
      source: "bank",
      allowPYQ: false,
      allowBookmarks: false,
      allowWrong: false,
      allowChapterSelection: false,
      allowRandom: false,
      allowTimer: false
    };
  }

  /* =========================================================
     DISABLE FREE MODE CONTROLS

     Pass the existing subject-page element IDs.
     This is intentionally separate so the existing HTML
     structure does not have to be redesigned.
  ========================================================= */
  function applyFreeUI(options) {
    options = options || {};

    const ids = {
      sourceSelect: options.sourceSelect || "sourceSelect",
      chapterSelect: options.chapterSelect || "chapterSelect",
      attemptSelect: options.attemptSelect || "attemptSelect",
      wrongBtn: options.wrongBtn || "wrongBtn",
      bookBtn: options.bookBtn || "bookBtn",
      qDown: options.qDown || "qDown",
      qUp: options.qUp || "qUp",
      mDown: options.mDown || "mDown",
      mUp: options.mUp || "mUp",
      random: options.random || "random",
      timerMode: options.timerMode || "timerMode",
      questionTimeRow: options.questionTimeRow || "questionTimeRow",
      roundTimeRow: options.roundTimeRow || "roundTimeRow",
      startBtn: options.startBtn || "startBtn"
    };

    function get(id) {
      return document.getElementById(id);
    }

    /* MCQ Bank only */
    const sourceSelect = get(ids.sourceSelect);
    if (sourceSelect) {
      sourceSelect.value = "bank";

      Array.from(sourceSelect.options).forEach(function (option) {
        option.disabled = option.value !== "bank";
      });

      sourceSelect.disabled = true;
    }

    /* Chapter selection OFF */
    const chapterSelect = get(ids.chapterSelect);
    if (chapterSelect) {
      chapterSelect.value = "all";
      chapterSelect.disabled = true;
    }

    /* PYQ OFF */
    const attemptSelect = get(ids.attemptSelect);
    if (attemptSelect) {
      attemptSelect.disabled = true;
    }

    /* Wrong / Bookmark OFF */
    ["wrongBtn", "bookBtn"].forEach(function (key) {
      const el = get(ids[key]);
      if (el) {
        el.disabled = true;
        el.style.display = "none";
      }
    });

    /* Fixed 30 questions */
    const qDown = get(ids.qDown);
    const qUp = get(ids.qUp);

    if (qDown) {
      qDown.disabled = true;
      qDown.style.display = "none";
    }

    if (qUp) {
      qUp.disabled = true;
      qUp.style.display = "none";
    }

    /* Marks controls remain available unless the subject
       page decides otherwise. */
    const mDown = get(ids.mDown);
    const mUp = get(ids.mUp);

    if (mDown) mDown.disabled = true;
    if (mUp) mUp.disabled = true;

    /* Random OFF */
    const random = get(ids.random);
    if (random) {
      random.checked = false;
      random.disabled = true;
    }

    /* Timer OFF */
    const timerMode = get(ids.timerMode);
    if (timerMode) {
      timerMode.value = "off";
      timerMode.disabled = true;
    }

    const questionTimeRow = get(ids.questionTimeRow);
    if (questionTimeRow) {
      questionTimeRow.style.display = "none";
    }

    const roundTimeRow = get(ids.roundTimeRow);
    if (roundTimeRow) {
      roundTimeRow.style.display = "none";
    }
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */
  window.CMAAccess = {
    FREE_MCQ_LIMIT: FREE_MCQ_LIMIT,

    FREE_MCQ_IDS: FREE_MCQ_IDS.slice(),

    ADMIN_EMAIL: ADMIN_EMAIL,

    getAccessStatus: getAccessStatus,

    getFreeQuestions: getFreeQuestions,

    isFreeQuestion: isFreeQuestion,

    getFreeConfig: getFreeConfig,

    applyFreeUI: applyFreeUI,

    isFreeMode: async function () {
      const status = await getAccessStatus();
      return status.isFree === true;
    },

    isPaidMode: async function () {
      const status = await getAccessStatus();
      return status.isPaid === true;
    }
  };

  /*
     Optional console information for testing.
     Does not affect the portal.
  */
  window.CMAAccessReady = true;

})();
