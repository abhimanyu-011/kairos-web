// Kairos AI worker: loads the model and generates replies inside the browser (off the main thread).
import {
  pipeline,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

let generator = null;
let loadedKey = null;
const stopper = new InterruptableStoppingCriteria();
const fake = new URL(self.location.href).searchParams.get("fake") === "1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load({ model, device, dtype }) {
  const key = `${model}|${device}|${dtype}`;
  if (generator && loadedKey === key) {
    self.postMessage({ type: "ready", device, dtype });
    return;
  }
  if (fake) {
    for (let p = 0; p <= 100; p += 20) {
      self.postMessage({ type: "progress", percent: p, loaded: p * 1e7, total: 1e9 });
      await sleep(60);
    }
    generator = "fake";
    loadedKey = key;
    self.postMessage({ type: "ready", device: "test", dtype: "fake" });
    return;
  }

  // progress across all files the model needs
  const files = {};
  const onProgress = (p) => {
    if (p.status === "progress" && p.file) {
      files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
      let loaded = 0, total = 0;
      for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
      self.postMessage({ type: "progress", percent: total ? (loaded / total) * 100 : 0, loaded, total });
    }
  };

  try {
    generator = await pipeline("text-generation", model, { device, dtype, progress_callback: onProgress });
    loadedKey = key;
    self.postMessage({ type: "warming" });
    // tiny warm-up so the first real reply starts faster
    await generator([{ role: "user", content: "Hi" }], { max_new_tokens: 1 });
    self.postMessage({ type: "ready", device, dtype });
  } catch (err) {
    generator = null;
    loadedKey = null;
    self.postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
  }
}

async function generate({ messages, maxTokens }) {
  stopper.reset();
  if (generator === "fake") {
    const reply = "Hello! I'm **Kairos**, created by Abhimanyu. This is *test mode*.\n\n```python\nprint('hi')\n```";
    for (const word of reply.split(/(\s+)/)) {
      if (stopper.interrupted) break;
      self.postMessage({ type: "token", text: word });
      await sleep(15);
    }
    self.postMessage({ type: "done" });
    return;
  }
  if (!generator) {
    self.postMessage({ type: "error", message: "Model not loaded yet." });
    return;
  }
  try {
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text) => self.postMessage({ type: "token", text }),
    });
    await generator(messages, {
      max_new_tokens: maxTokens || 600,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.9,
      repetition_penalty: 1.05,
      streamer,
      stopping_criteria: stopper,
    });
    self.postMessage({ type: "done" });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
  }
}

self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "load") load(msg);
  else if (msg.type === "generate") generate(msg);
  else if (msg.type === "stop") stopper.interrupt();
});
