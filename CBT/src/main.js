import { createApp } from "vue";
import App from "/CBT/src/App.js";
import router from "/CBT/src/router.js";

const app = createApp(App);
app.use(router);
app.mount("#app");
