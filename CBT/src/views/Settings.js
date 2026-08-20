import { authState, isAdmin, refreshProfile } from "../state/auth.js";
import { upsertUserProfile } from "../lib/db.js";
import { importPyqSet } from "../lib/db.js";

const GEMINI_KEY = "cbt_gemini_key";

export default {
  name: "SettingsView",
  data() {
    return {
      apiKey: localStorage.getItem(GEMINI_KEY) || "",
      mode: authState.profile?.examMode || "IOE",
      pyqJson: "",
      pyqMeta: { examMode: "IOE", title: "", year: new Date().getFullYear(), label: "" },
      status: ""
    };
  },
  computed: {
    admin: () => isAdmin()
  },
  watch: {
    apiKey(val) {
      localStorage.setItem(GEMINI_KEY, val);
    }
  },
  methods: {
    async saveMode() {
      await upsertUserProfile(authState.user, { examMode: this.mode });
      await refreshProfile();
      this.status = "Exam track saved.";
    },
    async importPyq() {
      this.status = "";
      try {
        const parsed = JSON.parse(this.pyqJson);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions;
        if (!questions?.length) throw new Error("JSON must be an array of questions.");
        await importPyqSet({ ...this.pyqMeta, questions });
        this.status = `Imported ${questions.length} questions.`;
        this.pyqJson = "";
      } catch (err) {
        this.status = err.message;
      }
    }
  },
  template: `
  <div class="max-w-3xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold text-zinc-100">Settings</h1>

    <section class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-5 space-y-3">
      <h2 class="text-xs font-bold text-red-400 uppercase tracking-wider">Gemini API key</h2>
      <p class="text-[11px] text-zinc-500">Stored only on this device. It is never written to Firestore.</p>
      <input type="password" v-model="apiKey" placeholder="Paste AI Studio key" class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono outline-none focus:border-red-700" />
      <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-red-400 text-xs">Get API Key ↗</a>
    </section>

    <section class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-5 space-y-3">
      <h2 class="text-xs font-bold text-red-400 uppercase tracking-wider">Exam track</h2>
      <select v-model="mode" class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm">
        <option value="IOE">IOE</option>
        <option value="CEE">CEE</option>
        <option value="OTHER">Other</option>
      </select>
      <button @click="saveMode" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold px-4 py-2 rounded-lg border border-zinc-700">Save track</button>
    </section>

    <section v-if="admin" class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-5 space-y-3">
      <h2 class="text-xs font-bold text-red-400 uppercase tracking-wider">Admin · Import PYQ JSON</h2>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <select v-model="pyqMeta.examMode" class="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
          <option>IOE</option>
          <option>CEE</option>
        </select>
        <input v-model.number="pyqMeta.year" type="number" class="bg-zinc-950 border border-zinc-800 rounded-lg p-2" />
        <input v-model="pyqMeta.title" placeholder="Set title" class="col-span-2 bg-zinc-950 border border-zinc-800 rounded-lg p-2" />
        <input v-model="pyqMeta.label" placeholder="Label (e.g. Model paper)" class="col-span-2 bg-zinc-950 border border-zinc-800 rounded-lg p-2" />
      </div>
      <textarea v-model="pyqJson" rows="8" placeholder='[ { "text": "...", "options": ["A","B","C","D"], "correctAnswer": 0 } ]' class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-[11px] font-mono"></textarea>
      <button @click="importPyq" class="bg-red-900 hover:bg-red-800 text-white text-xs font-bold px-4 py-2 rounded-lg border border-red-700">Import set</button>
    </section>

    <p v-if="status" class="text-xs text-zinc-400">{{ status }}</p>
  </div>
  `
};
