import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import { toast } from "sonner";
import { GameProcess } from "@/lib/native/game-process";
import type { GameEntry } from "@/store/game-library";
import { addRunningGame } from "@/store/running-games";
import type { EmulatorVersion } from "@/store/version-manager";
import { stringifyError } from "@/utils/error";

export async function startGame(emu: EmulatorVersion, game: GameEntry) {
    const gameDir = game.path;
    const gameBinary = await join(gameDir, "eboot.bin");
    if (!(await exists(gameBinary))) {
        const msg = "Game binary (eboot.bin) not found";
        toast.error(msg);
        console.warn(msg);
        return;
    }

    const suffix = platform() === "windows" ? ".exe" : "";

    const emuBinary = await join(emu.path, `shadPS4${suffix}`);
    if (!(await exists(emuBinary))) {
        const msg = "Emulator binary not found";
        toast.error(msg);
        console.warn(msg);
        return;
    }

    const workDir = await join(await appDataDir(), "emu_data");
    if (!(await exists(workDir))) {
        await mkdir(workDir, { recursive: true });
    }

    try {
        const process = await GameProcess.startGame(
            emuBinary,
            workDir,
            gameBinary,
        );
        addRunningGame(game, process);
        toast.success("Game started");
    } catch (e) {
        const msg = `Couldn't start the game: ${stringifyError(e)}`;
        console.error(msg);
        toast.error(msg);
    }
}
