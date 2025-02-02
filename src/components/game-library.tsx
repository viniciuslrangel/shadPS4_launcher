import { type GameEntry, gameLibrary } from "@/store/game-library";
import { pathPreferences } from "@/store/paths";
import { defaultStore } from "@/store/store";
import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { copyFile, exists } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { useAtom } from "jotai";
import { useCallback } from "react";

function GameBox({ game }: { game: GameEntry }) {
  const openGame = useCallback(
    () =>
      void (async () => {
        const runTarget = await join(await appDataDir(), "shadps4-emu.exe");

        if (!(await exists(runTarget))) {
          const emuPath = defaultStore.get(pathPreferences.emulatorPath);
          await copyFile(emuPath, runTarget);
        }

        const elfPath = await join(game.path, "eboot.bin");

        void Command.create("shadps4-emu", ["-g", elfPath], {
          cwd: await appDataDir(),
        }).execute();
      })(),
    [game],
  );

  return (
    <div
      key={game.id}
      className="space-y-2 bg-zinc-800 transition-all hover:z-20 hover:scale-125"
      onDoubleClick={openGame}
    >
      <div className="aspect-square relative overflow-hidden rounded-md bg-zinc-800">
        {(game.cover && (
          <img
            src={convertFileSrc(game.cover)}
            alt={game.title}
            className="object-cover"
          />
        )) || (
          <div className="center">
            <span className="text-red-500">No cover</span>
          </div>
        )}
      </div>
      <div className="text-xs text-zinc-400">{game.id}</div>
    </div>
  );
}

export function GameLibrary() {
  const [games] = useAtom(gameLibrary);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-10 gap-4">
      {games.map((game) => (
        <GameBox key={game.id} game={game} />
      ))}
    </div>
  );
}
