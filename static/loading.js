import { ReadableStream as PolyfillReadableStream, TransformStream as PolyfillTransformStream } from '/web-streams.es6.mjs';
import { createReadableStreamWrapper } from '/web-streams-adapter.mjs';

// `progressiveFetch` is a wrapper over `window.fetch`. It allows you to insert middle-ware that is
// polled as the fetch completes. See bevy-website/issues/338 for details.
async function progressiveFetch(resource, callbacks={}) {
  const toPolyfillReadable = createReadableStreamWrapper(PolyfillReadableStream);
  const toNativeReadable = createReadableStreamWrapper(window.ReadableStream);

  const cb = Object.assign({
    start: (length) => {},
    update: (loaded, length) => {},
    finish: (length) => {},
  }, callbacks);
  let response = await fetch(resource);
  const lengthBytes = response.headers.get('content-length');
  let loadedBytes = 0;
  const transform = new PolyfillTransformStream({
    start() {
      cb.start(lengthBytes);
    },
    transform(chunk, controller) {
      loadedBytes += chunk.byteLength;
      cb.update(loadedBytes, lengthBytes);
      controller.enqueue(chunk);
    },
    flush() {
      cb.finish(lengthBytes);
    },
  });
  return new Response(toNativeReadable(toPolyfillReadable(response.body).pipeThrough(transform)), response);
}

// Hi curious user!
// This approach to add loading feedback on web is a big HACK. Please review `generate_wasm_examples.sh`
// to see the patches we're applying to the JS file to accept a custom `fetch`. This is a temporary
// workaround until Bevy has an in-engine mode for showing loading feeback. See:
// https://github.com/bevyengine/bevy-website/pull/355
function loadingBarFetch(canvas_id) {
    const canvasEl = document.getElementById(canvas_id);
    canvasEl.classList.add('bevy__canvas--loading')
    // wrap canvas element
    const canvasWrapperEl = document.createElement('div');
    canvasWrapperEl.classList.add('bevy__canvas-wrapper');
    canvasEl.parentNode.insertBefore(canvasWrapperEl, canvasEl);
    canvasWrapperEl.appendChild(canvasEl);
    // insert progress-status element
    const progressStatusEl = document.createElement('div');
    progressStatusEl.classList.add('bevy__progress-status');
    canvasEl.parentNode.insertBefore(progressStatusEl, canvasEl);

    // const progressStatusEl = document.querySelector('[data-progress-status]');
    let hideProgressTimeoutId;
    return async function(resource) {
        // Create new progress bar
        const trackEl = document.createElement('div');
        trackEl.classList.add('bevy__progress-track');
        const progressBarEl = document.createElement('div');
        progressBarEl.classList.add('bevy__progress-bar');

        // Attach progress bar
        trackEl.appendChild(progressBarEl);
        progressStatusEl.appendChild(trackEl);

        return progressiveFetch(resource, {
            start: (_) => {
                progressStatusEl.style.display = 'block';
                if (hideProgressTimeoutId) {
                    clearTimeout(hideProgressTimeoutId);
                }
            },
            update: (loaded, total) => {
                progressBarEl.style.width = (100 * loaded/total) + '%';
            },
            finish: (_) => {
                hideProgressTimeoutId = setTimeout(() => {
                    progressStatusEl.style.display = 'none';
                }, 50);
            }
        })
    }
}

export { progressiveFetch, loadingBarFetch };
