/* =========================================================
   CMA MCQ PORTAL - ACCESS CONTROL
   TEST SITE: BUSINESS LAW & ETHICS

   FREE USER:
   - Fixed 30 MCQ Bank questions
   - Q1 to Q30
   - Same 30 questions every time
   - No random
   - No timer
   - No chapter selection
   - No PYQ
   - No bookmarks
   - No reattempt wrong
   - Instant answer ON

   PAID USER:
   - Existing full functionality
========================================================= */

(function () {
  "use strict";

  /* =====================================================
     CENTRAL FREE LIMIT

     Later, if you want 30 -> 50:
     just change this number.
  ===================================================== */
  const FREE_MCQ_LIMIT = 30;

  /* Fixed questions: Q1 to Q30 */
  const FREE_MCQ_IDS = Array.from(
    { length: FREE_MCQ_LIMIT },
    (_, i) => i + 1
  );

  const ADMIN_EMAIL = "taxxpath@gmail.com";

  /* =====================================================
     FIREBASE CONFIG
  ===================================================== */
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA7tGvsDYyYLSWFPeS6lsxlP8gLOw53Wrk",
    authDomain: "cma-mcq-portal.firebaseapp.com",
    projectId: "cma-mcq-portal",
    storageBucket: "cma-mcq-portal.firebasestorage.app",
    messagingSenderId: "734935438365",
    appId: "1:734935438365:web:40ea0a7677ef572234a2f4",
    measurementId: "G-H6GDK7Y3RJ"
  };

  /* =====================================================
     FIREBASE INITIALIZATION
  ===================================================== */
  if (typeof firebase !== "undefined") {

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

  } else {

    console.error("Firebase SDK is not loaded.");

  }

  const auth =
    typeof firebase !== "undefined" && firebase.auth
      ? firebase.auth()
      : null;

  const db =
    typeof firebase !== "undefined" && firebase.firestore
      ? firebase.firestore()
      : null;

  /* =====================================================
     HELPERS
  ===================================================== */

  function normaliseEmail(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function isExpired(dateValue) {

    if (!dateValue) return false;

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

  /* =====================================================
     GET USER ACCESS STATUS
  ===================================================== */

  async function getAccessStatus() {

    /* Not signed in */
    if (!auth || !auth.currentUser) {

      return {
        mode: "free",
        isFree: true,
        isPaid: false,
        isAdmin: false,
        signedIn: false,
        data: null
      };

    }

    const user = auth.currentUser;
    const email = normaliseEmail(user.email);

    /* ===================================================
       ADMIN = FULL ACCESS
    =================================================== */

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

    /* ===================================================
       GLOBAL ACCESS = FULL ACCESS
    =================================================== */

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

    /* ===================================================
       APPROVED / SUBSCRIBED USER
    =================================================== */

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
             Active
             + Group access
             + Not expired

             = PAID
          */

          if (
            status === "active" &&
            !expired &&
            hasPaidGroupAccess(data)
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

    /* ===================================================
       EVERY OTHER SIGNED-IN USER = FREE MODE

       IMPORTANT:
       There is NO usage counter here.

       Therefore the same 30 questions can be
       attempted again and again.
    =================================================== */

    return {

      mode: "free",

      isFree: true,

      isPaid: false,

      isAdmin: false,

      signedIn: true,

      data: null

    };

  }

  /* =====================================================
     GET FIXED FREE QUESTIONS

     This returns ONLY:
       MCQ Bank
       Question ID 1-30
  ===================================================== */

  function getFreeQuestions(questions) {

    if (!Array.isArray(questions)) {
      return [];
    }

    const allowedIds =
      new Set(FREE_MCQ_IDS);

    return questions.filter(function (question) {

      return (
        question &&
        question.source === "bank" &&
        allowedIds.has(
          Number(question.id)
        )
      );

    });

  }

  /* =====================================================
     CHECK FREE QUESTION
  ===================================================== */

  function isFreeQuestion(question) {

    if (!question) return false;

    return (
      question.source === "bank" &&
      FREE_MCQ_IDS.includes(
        Number(question.id)
      )
    );

  }

  /* =====================================================
     FREE MODE CONFIG
  ===================================================== */

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

  /* =====================================================
     APPLY FREE UI RESTRICTIONS

     This will be used in the Business Law page.
  ===================================================== */

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
        "roundTimeRow"

    };

    function get(id) {
      return document.getElementById(id);
    }

    /* ================================================
       MCQ BANK ONLY
    ================================================ */

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

    /* ================================================
       CHAPTER OFF
    ================================================ */

    const chapterSelect =
      get(ids.chapterSelect);

    if (chapterSelect) {

      chapterSelect.value = "all";

      chapterSelect.disabled = true;

    }

    /* ================================================
       PYQ OFF
    ================================================ */

    const attemptSelect =
      get(ids.attemptSelect);

    if (attemptSelect) {

      attemptSelect.disabled = true;

    }

    /* ================================================
       WRONG + BOOKMARK OFF
    ================================================ */

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

    /* ================================================
       QUESTION COUNT FIXED
    ================================================ */

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

    /* ================================================
       RANDOM OFF
    ================================================ */

    const random =
      get(ids.random);

    if (random) {

      random.checked = false;

      random.disabled = true;

    }

    /* ================================================
       TIMER OFF
    ================================================ */

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

  /* =====================================================
     PUBLIC API
  ===================================================== */

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

  window.CMAAccessReady = true;

})();
