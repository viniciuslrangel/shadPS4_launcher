import { basename, join } from "@tauri-apps/api/path";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import { atom } from "jotai";
import { pathPreferences } from "./paths";

export interface GameEntry {
  id: string;
  title: string;
  cover: string | null;
  path: string;
}

export const gameLibrary = atom(async (get) => {
  const knownPaths: string[] = [];

  async function isGame(path: string) {
    const paramSfoPath = await join(path, "sce_sys", "param.sfo");
    if (await exists(paramSfoPath)) {
      return true;
    }
    const eBootPath = await join(path, "eboot.bin");
    if (await exists(eBootPath)) {
      return true;
    }
    return false;
  }

  async function discoverGame(path: string) {
    try {
      if (await isGame(path)) {
        knownPaths.push(path);
        return;
      }
      void (await Promise.all(
        (await readDir(path)).map(async (child) => {
          if (child.isDirectory) {
            await discoverGame(await join(path, child.name));
          }
        }),
      ));
    } catch (error) {
      console.error(`Error discovering game: ${path}. ${error}`);
    }
  }

  const v = get(pathPreferences.gamesPath);
  if (!v || !(await exists(v))) {
    return [];
  }
  void (await discoverGame(v));

  return await Promise.all(
    knownPaths.map(async (path): Promise<GameEntry> => {
      const b = await basename(path);
      let cover: string | null = await join(path, "sce_sys", "icon0.png");
      if (!(await exists(cover))) {
        cover = null;
      }
      return {
        id: b,
        title: b,
        cover,
        path,
      };
    }),
  );
});
