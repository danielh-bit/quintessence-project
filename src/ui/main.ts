// Entry point of the browser sandbox.
import "./style.css";
import v0 from "../../rules/v0.json";
import { loadRules } from "../core";
import { App } from "./app";
import { errorText } from "./dom";

const mount = document.getElementById("app")!;
try {
  const rules = loadRules(v0);
  new App(mount, rules).start();
} catch (e) {
  mount.textContent = `The sandbox could not start: ${errorText(e)}`;
  mount.className = "fatal";
  console.error(e);
}
