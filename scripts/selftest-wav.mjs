import { renderWav, renderConfirmWav, TIMBRES } from "../lib/wav.js";

let failed = 0;
for (const id of TIMBRES) {
  const wav = renderWav(id);
  const riff = wav.toString("ascii", 0, 4);
  const wave = wav.toString("ascii", 8, 12);
  const frames = (wav.length - 44) / 4;
  // 峰值：排除头 100 帧，确认不是全零
  let peak = 0;
  for (let i = 100; i < frames; i += 1) {
    const v = Math.abs(wav.readInt16LE(44 + i * 4));
    if (v > peak) peak = v;
  }
  const ok = riff === "RIFF" && wave === "WAVE" && frames > 24000 && peak > 200;
  if (!ok) failed += 1;
  console.log(`${ok ? "OK " : "BAD"} ${id.padEnd(8)} bytes=${String(wav.length).padStart(8)} frames=${String(frames).padStart(6)} peak=${peak}`);
}

const confirm = renderConfirmWav();
const confirmFrames = (confirm.length - 44) / 4;
let confirmPeak = 0;
for (let i = 100; i < confirmFrames; i += 1) {
  const v = Math.abs(confirm.readInt16LE(44 + i * 4));
  if (v > confirmPeak) confirmPeak = v;
}
const confirmOk = confirmFrames > 24000 && confirmPeak > 200;
if (!confirmOk) failed += 1;
console.log(`${confirmOk ? "OK " : "BAD"} confirm  bytes=${String(confirm.length).padStart(8)} frames=${String(confirmFrames).padStart(6)} peak=${confirmPeak}`);

if (failed > 0) {
  console.error(`FAILED: ${failed}`);
  process.exit(1);
}
console.log("wav renderer self-test passed");
