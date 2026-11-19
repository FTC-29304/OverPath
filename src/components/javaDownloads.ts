import { RUNNER_VERSION } from '../codegen/version';
import type { HardwareConfig } from '../model/types';
import { usePlanner } from '../store/plannerStore';
import { downloadText } from './files';

export async function downloadRunner(pkg: string) {
  const { default: source } = await import('../../java/OverPath.java?raw');
  downloadText('OverPath.java', source.replace(/^package [^;]+;/m, `package ${pkg};`), 'text/x-java');
  usePlanner.getState().setView({ runnerDownloaded: RUNNER_VERSION });
}

export async function downloadCalibration(config: HardwareConfig, view: { robotLengthIn: number; robotWidthIn: number }) {
  const { generateCalibrationOpMode } = await import('../codegen/calibration');
  const cal = generateCalibrationOpMode(config, { lengthIn: view.robotLengthIn, widthIn: view.robotWidthIn });
  downloadText(`${cal.className}.java`, cal.code, 'text/x-java');
}
