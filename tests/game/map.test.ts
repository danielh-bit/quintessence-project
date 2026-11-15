// The map file: parsing, validation, and the crash site itself.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import player from "../../data/player.json";
import rulesJson from "../../rules/v0.json";
import { loadRules } from "../../src/core";
import { input, loadActorConfig, loadMap, parseMapText } from "../../src/game";
import { brightness } from "../helpers/observe";

const rules = loadRules(rulesJson);
const config = loadActorConfig(player);
const crashText = readFileSync(new URL("../../maps/crash-site.txt", import.meta.url), "utf8");

const tiny = (rows: string[], extra = "") =>
  `# = hard_rock\ns = lobime loose\nstart = @\n${extra}map:\n${rows.join("\n")}\n`;

describe("map text", () => {
  it("parses the legend, flags and rows", () => {
    const m = parseMapText("# = hard_rock\nC = colomium loose bond ; a boulder\nstart = @\nhatch = +\nmap:\n..\n##\n");
    expect(m.rows).toEqual(["..", "##"]);
    expect(m.legend["#"]).toEqual({ element: "hard_rock" });
    expect(m.legend.C).toEqual({ element: "colomium", loose: true, bond: true });
    expect(m.start).toBe("@");
    expect(m.hatch).toBe("+");
  });

  it("fails with a clear message on bad input", () => {
    expect(() => parseMapText("# = hard_rock\nmap:\n#\n")).toThrow(/start/);
    expect(() => parseMapText("start = @\n# hard_rock\nmap:\n#\n")).toThrow(/line 2/);
    expect(() => parseMapText("start = @\n# = hard_rock fly\nmap:\n#\n")).toThrow(/unknown flag/);
    expect(() => parseMapText("start = @\n. = hard_rock\nmap:\n#\n")).toThrow(/empty/);
  });

  it("rejects unknown elements, unknown characters and uneven rows", () => {
    const rows = [...Array(5).fill("........"), "@.......", "........", "........", "........", "########"];
    const ok = rows.map((r) => r);
    expect(() => loadMap(rules, config, parseMapText(tiny(ok, "")))).not.toThrow();
    expect(() => loadMap(rules, config, parseMapText(tiny(ok).replace("hard_rock", "nothing")))).toThrow(/unknown element "nothing"/);
    expect(() => loadMap(rules, config, parseMapText(tiny(ok.map((r, k) => (k === 2 ? r + "?" : r)))))).toThrow(/row 3/);
    expect(() => loadMap(rules, config, parseMapText(tiny(ok.map((r, k) => (k === 2 ? "...?...." : r)))))).toThrow(/"\?" is not in the legend/);
  });

  it("reports a start that leaves no room for the body", () => {
    const rows = ["@.......", "########"];
    expect(() => loadMap(rules, config, parseMapText(tiny(rows)))).toThrow(/does not fit/);
  });

  it("puts terrain down anchored and loose cells down loose, bonding touching ones", () => {
    const rows = [...Array(5).fill("........"), "@..CC...", "...CC...", "........", "........", "########"];
    const text = tiny(rows, "C = colomium loose bond\n");
    const { game } = loadMap(rules, config, parseMapText(text));
    const w = game.world;
    expect(w.bodyAt(0, 9)).toBeUndefined();
    expect(w.bodyAt(3, 5)!.cells.length).toBe(4);
  });
});

describe("the crash site", () => {
  const map = parseMapText(crashText);
  const loaded = loadMap(rules, config, map);
  const { game, hatch } = loaded;
  const w = game.world;

  it("loads, with a hatch next to where the body starts", () => {
    expect(hatch).not.toBeNull();
    const b = game.bounds()!;
    expect(Math.abs(b.x - (hatch!.x + hatch!.width))).toBeLessThanOrEqual(6);
    expect(hatch!.y + hatch!.height).toBe(b.y + b.height);
  });

  it("holds every element of the crash site", () => {
    const present = new Set<string>();
    for (let i = 0; i < w.size; i++) if (w.elem[i] !== 0) present.add(rules.elements[w.elem[i]].id);
    for (const id of ["dense_lobime", "galog", "queflair", "bormite", "colomium", "exgen", "ralgen", "hard_rock", "sormite", "lyegen"]) {
      expect(present.has(id), id).toBe(true);
    }
  });

  it("stands still when nobody touches it, and the first Queflair glows near the ship", () => {
    for (let t = 0; t < 200; t++) game.step(input());
    expect(brightness(w, "queflair")).toBeGreaterThan(1);
    expect(game.body()).toBeDefined();
  });
});
