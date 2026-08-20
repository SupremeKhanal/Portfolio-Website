import { createRouter, createWebHashHistory } from "vue-router";
import { watch } from "vue";
import { authState } from "./state/auth.js";
import { isFirebaseConfigured } from "./firebase.js";
import Login from "./views/Login.js";
import Onboarding from "./views/Onboarding.js";
import Dashboard from "./views/Dashboard.js";
import Exam from "./views/Exam.js";
import Result from "./views/Result.js";
import PyqLibrary from "./views/PyqLibrary.js";
import Settings from "./views/Settings.js";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    { path: "/login", name: "login", component: Login, meta: { public: true, hideNav: true } },
    { path: "/onboarding", name: "onboarding", component: Onboarding, meta: { hideNav: true } },
    { path: "/dashboard", name: "dashboard", component: Dashboard },
    { path: "/exam", name: "exam", component: Exam, meta: { hideNav: true } },
    { path: "/result/:id", name: "result", component: Result, meta: { hideNav: true } },
    { path: "/pyq", name: "pyq", component: PyqLibrary },
    { path: "/settings", name: "settings", component: Settings }
  ]
});

function waitForAuth() {
  if (authState.ready) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(
      () => authState.ready,
      (ready) => {
        if (ready) {
          stop();
          resolve();
        }
      }
    );
  });
}

router.beforeEach(async (to) => {
  await waitForAuth();
  if (!isFirebaseConfigured()) {
    if (to.name !== "login") return { name: "login" };
    return true;
  }
  if (!authState.user) {
    if (to.meta.public) return true;
    return { name: "login" };
  }
  if (!authState.profile?.examMode && to.name !== "onboarding") {
    return { name: "onboarding" };
  }
  if (authState.profile?.examMode && (to.name === "login" || to.name === "onboarding")) {
    return { name: "dashboard" };
  }
  return true;
});

export default router;
