import NavBar from "./components/NavBar.js";
import { authState } from "./state/auth.js";

export default {
  name: "App",
  components: { NavBar },
  computed: {
    hideNav() {
      return Boolean(this.$route.meta.hideNav);
    },
    hideCredit() {
      return Boolean(this.$route.meta.hideCredit);
    },
    ready() {
      return authState.ready;
    }
  },
  template: `
  <div class="min-h-screen flex flex-col bg-slate-950 text-slate-200">
    <div v-if="!ready" class="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading portal…</div>
    <template v-else>
      <NavBar v-if="!hideNav" />
      <div class="flex-1">
        <router-view />
      </div>
      <footer v-if="!hideCredit" class="px-4 py-5 text-center text-[11px] text-slate-500 border-t border-slate-800/80">
        Made by
        <a href="../index.html" class="text-sky-400 hover:underline">Supreme</a>
        · Idea
        <a href="https://poudelsulav.com.np" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:underline">Sulav</a>
      </footer>
    </template>
  </div>
  `
};
