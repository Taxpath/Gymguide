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
========================================================= */

(function () {
  "use strict";

  /* =========================================================
     CENTRAL FREE LIMIT
     Change only this number if later you want 30 -> 50.
  ========================================================= */
  const FREE_MCQ_LIMIT = 30;

  /* Fixed free question IDs: 1 to 30 */
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

    const expiry = String(dateValue).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      return false;
    }

    const today = new Date().toISOString().slice(0, 10);

    return expiry < today;
  }

  /* =========================================================
     CHECK PAID GROUP ACCESS
  ========================================================= */
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
     WAIT FOR FIREBASE AUTH TO INITIALIZE
  ========================================================= */
  function waitForAuthReady() {
    return new Promise(function (resolve) {

      if (!auth) {
        resolve(null);
        return;
      }

      /* Already available */
      if (auth.currentUser) {
        resolve(auth.currentUser);
        return;
      }

      let finished = false;
      let unsubscribe = null;

      try {

        unsubscribe = auth.onAuthStateChanged(function (user) {

          if (finished) return;

          finished = true;

          try {
            if (unsubscribe) {
              unsubscribe();
            }
          } catch (e) {}

          resolve(user || null);
        });

      } catch (error) {

        console.warn("Auth initialization error:", error);

        resolve(auth.currentUser || null);

        return;
      }

      /* Safety timeout */
      setTimeout(function () {

        if (finished) return;

        finished = true;

        try {
          if (unsubscribe) {
            unsubscribe();
          }
        } catch (e) {}

        resolve(auth.currentUser || null);

      }, 5000);
    });
  }

  /* =========================================================
     GET CURRENT ACCESS STATUS
  ========================================================= */
  async function getAccessStatus() {

    const user = await waitForAuthReady();

    /* -------------------------------------------------------
       NOT SIGNED IN
    ------------------------------------------------------- */

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

    /* -------------------------------------------------------
       ADMIN = FULL ACCESS
    ------------------------------------------------------- */

    if (email === ADMIN_EMAIL) {

      return {
        mode: "admin",
        isFree: false,
        isPaid: true,
        isAdmin: true,
        signedIn: true,
        data: {
          role: "admin",
          email: email
        }
      };
    }

    /* -------------------------------------------------------
       GLOBAL OPEN ACCESS
    ------------------------------------------------------- */

    try {

      if (db) {

        const globalRef =
          await db.doc("settings/globalAccess").get();

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

      console.warn(
        "Global access check failed:",
        error
      );
    }

    /* -------------------------------------------------------
       APPROVED USER / SUBSCRIPTION CHECK
    ------------------------------------------------------- */

    try {

      if (db && email) {

        const ref =
          await db
            .collection("approvedUsers")
            .doc(email)
            .get();

        if (ref.exists) {

          const data = ref.data() || {};

          const status =
            String(
              data.status || "active"
            ).toLowerCase();

          const expired =
            isExpired(data.expiryDate);

          /*
             Primary access flags
          */
          let groupAccess =
            hasPaidGroupAccess(data);

          /*
             Compatibility:
             Also allow access when admin data uses
             group/accessGroup fields.
          */

          const group =
            String(
              data.group ||
              data.accessGroup ||
              ""
            ).trim();

          if (
            group === "CMA Foundation" ||
            group === "Foundation"
          ) {
            groupAccess = true;
          }

          if (
            group === "CMA Inter Group 1" ||
            group === "Inter Group 1"
          ) {
            groupAccess = true;
          }

          if (
            group === "CMA Inter Group 2" ||
            group === "Inter Group 2"
          ) {
            groupAccess = true;
          }

          if (
            group === "CMA Final Group 3" ||
            group === "Final Group 3"
          ) {
            groupAccess = true;
          }

          if (
            group === "CMA Final Group 4" ||
            group === "Final Group 4"
          ) {
            groupAccess = true;
          }

          /*
             Active + non-expired + group access
             = PAID MODE
          */

          if (
            status === "active" &&
            !expired &&
            groupAccess
          ) {

            return {
              mode: "paid",
              isFree: false,
              isPaid: true,
              isAdmin: false,
              signedIn: true,
              data: data
            };
          }
        }
      }

    } catch (error) {

      console.warn(
        "Subscription access check failed:",
        error
      );
    }

    /* -------------------------------------------------------
       SIGNED-IN USER WITHOUT PAID ACCESS
       = FREE MODE
    ------------------------------------------------------- */

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
     GET FIXED FREE QUESTIONS
  ========================================================= */

  function getFreeQuestions(questions) {

    if (!Array.isArray(questions)) {
      return [];
    }

    const allowed =
      new Set(FREE_MCQ_IDS);

    return questions.filter(function (question) {

      return (
        question &&
        question.source === "bank" &&
        allowed.has(Number(question.id))
      );

    });
  }

  /* =========================================================
     CHECK WHETHER QUESTION IS FREE
  ========================================================= */

  function isFreeQuestion(question) {

    if (!question) {
      return false;
    }

    return (
      question.source === "bank" &&
      FREE_MCQ_IDS.includes(
        Number(question.id)
      )
    );
  }

  /* =========================================================
     FREE MODE CONFIG
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
     APPLY FREE UI SETTINGS
  ========================================================= */

  function applyFreeUI(options) {

    options = options || {};

    const ids = {

      sourceSelect:
        options.sourceSelect ||
        "sourceSelect",

      chapterSelect:
        options.chapterSelect ||
        "chapterSelect",

      attemptSelect:
        options.attemptSelect ||
        "attemptSelect",

      wrongBtn:
        options.wrongBtn ||
        "wrongBtn",

      bookBtn:
        options.bookBtn ||
        "bookBtn",

      qDown:
        options.qDown ||
        "qDown",

      qUp:
        options.qUp ||
        "qUp",

      mDown:
        options.mDown ||
        "mDown",

      mUp:
        options.mUp ||
        "mUp",

      random:
        options.random ||
        "random",

      timerMode:
        options.timerMode ||
        "timerMode",

      questionTimeRow:
        options.questionTimeRow ||
        "questionTimeRow",

      roundTimeRow:
        options.roundTimeRow ||
        "roundTimeRow",

      startBtn:
        options.startBtn ||
        "startBtn"
    };

    function get(id) {

      return document.getElementById(id);

    }

    /* -------------------------------------------------------
       MCQ BANK ONLY
    ------------------------------------------------------- */

    const sourceSelect =
      get(ids.sourceSelect);

    if (sourceSelect) {

      sourceSelect.value = "bank";

      Array.from(
        sourceSelect.options
      ).forEach(function (option) {

        option.disabled =
          option.value !== "bank";

      });

      sourceSelect.disabled = true;
    }

    /* -------------------------------------------------------
       CHAPTER SELECTION OFF
    ------------------------------------------------------- */

    const chapterSelect =
      get(ids.chapterSelect);

    if (chapterSelect) {

      chapterSelect.value = "all";

      chapterSelect.disabled = true;
    }

    /* -------------------------------------------------------
       PYQ OFF
    ------------------------------------------------------- */

    const attemptSelect =
      get(ids.attemptSelect);

    if (attemptSelect) {

      attemptSelect.disabled = true;

    }

    /* -------------------------------------------------------
       WRONG / BOOKMARK OFF
    ------------------------------------------------------- */

    ["wrongBtn", "bookBtn"].forEach(
      function (key) {

        const el =
          get(ids[key]);

        if (el) {

          el.disabled = true;

          el.style.display = "none";
        }

      }
    );

    /* -------------------------------------------------------
       FIXED 30 QUESTIONS
    ------------------------------------------------------- */

    const qDown =
      get(ids.qDown);

    const qUp =
      get(ids.qUp);

    if (qDown) {

      qDown.disabled = true;

      qDown.style.display = "none";
    }

    if (qUp) {

      qUp.disabled = true;

      qUp.style.display = "none";
    }

    /* -------------------------------------------------------
       MARKS CONTROL OFF
    ------------------------------------------------------- */

    const mDown =
      get(ids.mDown);

    const mUp =
      get(ids.mUp);

    if (mDown) {
      mDown.disabled = true;
    }

    if (mUp) {
      mUp.disabled = true;
    }

    /* -------------------------------------------------------
       RANDOM OFF
    ------------------------------------------------------- */

    const random =
      get(ids.random);

    if (random) {

      random.checked = false;

      random.disabled = true;
    }

    /* -------------------------------------------------------
       TIMER OFF
    ------------------------------------------------------- */

    const timerMode =
      get(ids.timerMode);

    if (timerMode) {

      timerMode.value = "off";

      timerMode.disabled = true;
    }

    const questionTimeRow =
      get(ids.questionTimeRow);

    if (questionTimeRow) {

      questionTimeRow.style.display =
        "none";
    }

    const roundTimeRow =
      get(ids.roundTimeRow);

    if (roundTimeRow) {

      roundTimeRow.style.display =
        "none";
    }
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  window.CMAAccess = {

    FREE_MCQ_LIMIT:
      FREE_MCQ_LIMIT,

    FREE_MCQ_IDS:
      FREE_MCQ_IDS.slice(),

    ADMIN_EMAIL:
      ADMIN_EMAIL,

    getAccessStatus:
      getAccessStatus,

    getFreeQuestions:
      getFreeQuestions,

    isFreeQuestion:
      isFreeQuestion,

    getFreeConfig:
      getFreeConfig,

    applyFreeUI:
      applyFreeUI,

    isFreeMode:
      async function () {

        const status =
          await getAccessStatus();

        return status.isFree === true;
      },

    isPaidMode:
      async function () {

        const status =
          await getAccessStatus();

        return status.isPaid === true;
      }
  };

  /* =========================================================
     READY FLAG
  ========================================================= */

  window.CMAAccessReady = true;

})();
