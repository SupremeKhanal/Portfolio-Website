import { authState, signOut } from "../state/auth.js";

export default {
  name: "NavBar",
  computed: {
    user() {
      return authState.user;
    },
    mode() {
      return authState.profile?.examMode || "—";
    }
  },
  methods: {
    async logout() {
      await signOut();
      this.$router.push({ name: "login" });
    }
  },
  template: `
  <header class="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <router-link to="/dashboard" class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-red-700"></span>
          <span class="font-bold text-zinc-100 text-sm">CBT Portal</span>
        </router-link>
        <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border border-red-900/60 bg-red-950/40 text-red-300">{{ mode }}</span>
      </div>
      <nav class="flex items-center gap-1 text-xs font-semibold">
        <router-link to="/dashboard" class="px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-100" active-class="bg-zinc-800 text-zinc-100">Dashboard</router-link>
        <router-link to="/pyq" class="px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-100" active-class="bg-zinc-800 text-zinc-100">PYQ Bank</router-link>
        <router-link to="/settings" class="px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-100" active-class="bg-zinc-800 text-zinc-100">Settings</router-link>
      </nav>
      <div class="flex items-center gap-3">
        <img v-if="user?.photoURL" :src="user.photoURL" class="w-8 h-8 rounded-full border border-zinc-700" alt="" />
        <button @click="logout" class="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg px-3 py-1.5">Sign out</button>
      </div>
    </div>
  </header>
  `
};
