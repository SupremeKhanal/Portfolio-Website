import NavBar from "./components/NavBar.js";
import { authState } from "./state/auth.js";

export default {
  name: "App",
  components: { NavBar },
  computed: {
    hideNav() {
      return Boolean(this.$route.meta.hideNav);
    },
    ready() {
      return authState.ready;
    }
  },
  template: `
  <div class="min-h-screen">
    <div v-if="!ready" class="min-h-screen flex items-center justify-center text-zinc-400 text-sm">Loading portal…</div>
    <template v-else>
      <NavBar v-if="!hideNav" />
      <router-view />
    </template>
    <div class="fixed bottom-3 right-4 z-50 pointer-events-none select-none">
      <div class="bg-zinc-900/90 border-zinc-800 text-zinc-400 backdrop-blur-md px-3 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 opacity-80">
        <div class="flex flex-col pointer-events-auto">
          <p class="text-[16px] font-semibold leading-tight text-zinc-300">
            Made by
            <a href="../index.html" target="_blank" rel="noopener noreferrer" class="text-red-500 font-extrabold tracking-wider hover:underline">Supreme</a>
          </p>
          <p class="text-[10.5px] opacity-90 leading-tight">
            Idea:
            <a href="https://poudelsulav.com.np" target="_blank" rel="noopener noreferrer" class="text-blue-500 font-bold tracking-wider hover:underline">Sulav</a>
          </p>
        </div>
      </div>
    </div>
  </div>
  `
};
