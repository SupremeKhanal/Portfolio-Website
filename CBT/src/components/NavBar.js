import { authState, signOut } from "../state/auth.js";

export default {
  name: "NavBar",
  data() {
    return { menuOpen: false };
  },
  computed: {
    user() {
      return authState.user;
    },
    mode() {
      return authState.profile?.examMode || "—";
    }
  },
  watch: {
    "$route.path"() {
      this.menuOpen = false;
    }
  },
  methods: {
    async logout() {
      await signOut();
      this.$router.push({ name: "login" });
    }
  },
  template: `
  <header class="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
    <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
      <router-link to="/dashboard" class="flex items-center gap-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-sky-400 shrink-0"></span>
        <span class="font-semibold text-slate-100 text-sm truncate">CBT Portal</span>
        <span class="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-400">{{ mode }}</span>
      </router-link>
      <nav class="hidden md:flex items-center gap-1 text-sm">
        <router-link to="/dashboard" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-100" active-class="bg-slate-800 text-slate-100">Dashboard</router-link>
        <router-link to="/pyq" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-100" active-class="bg-slate-800 text-slate-100">PYQ</router-link>
        <router-link to="/settings" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-100" active-class="bg-slate-800 text-slate-100">Settings</router-link>
      </nav>
      <div class="flex items-center gap-2">
        <img v-if="user?.photoURL" :src="user.photoURL" class="hidden sm:block w-8 h-8 rounded-full border border-slate-700" alt="" />
        <button @click="logout" class="hidden md:inline-flex text-xs text-slate-400 hover:text-slate-100 border border-slate-700 rounded-lg px-3 py-1.5">Sign out</button>
        <button @click="menuOpen = !menuOpen" class="md:hidden w-10 h-10 rounded-lg border border-slate-700 text-slate-200" aria-label="Menu">☰</button>
      </div>
    </div>
    <div v-if="menuOpen" class="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-3 space-y-1">
      <router-link to="/dashboard" class="block px-3 py-2.5 rounded-lg text-sm text-slate-300">Dashboard</router-link>
      <router-link to="/pyq" class="block px-3 py-2.5 rounded-lg text-sm text-slate-300">PYQ Bank</router-link>
      <router-link to="/settings" class="block px-3 py-2.5 rounded-lg text-sm text-slate-300">Settings</router-link>
      <button @click="logout" class="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-400">Sign out</button>
    </div>
  </header>
  `
};