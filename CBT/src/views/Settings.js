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
  <div class="max-w-xl mx-auto px-4 py-8 space-y-6">
    <h1 class="text-2xl font-semibold text-slate-50 tracking-tight">Settings</h1>

    <section class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
      <h2 class="text-sm font-medium text-slate-200">Gemini API key</h2>
      <p class="text-xs text-slate-500">Stored only on this device.</p>
      <input type="password" v-model="apiKey" placeholder="Paste AI Studio key" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm font-mono outline-none focus:border-sky-500" />
      <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-sky-400 text-sm">Get API key ↗</a>
    </section>

    <section class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
      <h2 class="text-sm font-medium text-slate-200">Exam track</h2>
      <select v-model="mode" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm">
        <option value="IOE">IOE</option>
        <option value="CEE">CEE</option>
        <option value="OTHER">Other</option>
      </select>
      <button @click="saveMode" class="bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-medium px-4 py-2.5 rounded-xl">Save track</button>
    </section>

    <section v-if="admin" class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
      <h2 class="text-sm font-medium text-slate-200">Admin · Import PYQ JSON</h2>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <select v-model="pyqMeta.examMode" class="bg-slate-950 border border-slate-700 rounded-xl p-2.5">
          <option>IOE</option>
          <option>CEE</option>
        </select>
        <input v-model.number="pyqMeta.year" type="number" class="bg-slate-950 border border-slate-700 rounded-xl p-2.5" />
        <input v-model="pyqMeta.title" placeholder="Set title" class="col-span-2 bg-slate-950 border border-slate-700 rounded-xl p-2.5" />
        <input v-model="pyqMeta.label" placeholder="Label" class="col-span-2 bg-slate-950 border border-slate-700 rounded-xl p-2.5" />
      </div>
      <textarea v-model="pyqJson" rows="8" placeholder='[ { "text": "...", "options": ["A","B","C","D"], "correctAnswer": 0 } ]' class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono"></textarea>
      <button @click="importPyq" class="bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">Import set</button>
    </section>

    <p v-if="status" class="text-sm text-slate-400">{{ status }}</p>
  </div>
  `
};