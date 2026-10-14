/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "402b66900e731ca748771b6fc5e7a068"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "0cf8b823b6e583ad43461e897246c23a"
  }, {
    "url": "pwa-512x512.png",
    "revision": "7db50f6443289c03dc605f465eb8fd77"
  }, {
    "url": "pwa-192x192.png",
    "revision": "04c53953601c0285246fe6f94e8de428"
  }, {
    "url": "index.html",
    "revision": "99210d7e705a5a32131531d326fed1e5"
  }, {
    "url": "icon.svg",
    "revision": "4b31ce41a4d8617a8b91f672e42cbcf5"
  }, {
    "url": "fonts/plus-jakarta-sans-latin.woff2",
    "revision": "7660bd9909fb097989b19471a75f1b7a"
  }, {
    "url": "fonts/jetbrains-mono-latin.woff2",
    "revision": "b636a65da4f00129f08c7df6e5dd75ac"
  }, {
    "url": "engine/stockfish.wasm",
    "revision": "c56761eebb1beb83d680f58428ed6286"
  }, {
    "url": "engine/stockfish.js",
    "revision": "81cc4511ffb3f02a40da47fcb1413cc5"
  }, {
    "url": "engine/stockfish-19-lite-single.wasm",
    "revision": "c56761eebb1beb83d680f58428ed6286"
  }, {
    "url": "engine/stockfish-19-lite-single.js",
    "revision": "81cc4511ffb3f02a40da47fcb1413cc5"
  }, {
    "url": "assets/plus-jakarta-sans-latin-eXO_dkmS.woff2",
    "revision": null
  }, {
    "url": "assets/minimaxWorker-BW9gNs3a.js",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-6fWv1k7M.woff2",
    "revision": null
  }, {
    "url": "assets/index-CiCrE7QH.js",
    "revision": null
  }, {
    "url": "assets/index-BC14UlTG.css",
    "revision": null
  }, {
    "url": "icon.svg",
    "revision": "4b31ce41a4d8617a8b91f672e42cbcf5"
  }, {
    "url": "pwa-192x192.png",
    "revision": "04c53953601c0285246fe6f94e8de428"
  }, {
    "url": "pwa-512x512.png",
    "revision": "7db50f6443289c03dc605f465eb8fd77"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "0cf8b823b6e583ad43461e897246c23a"
  }, {
    "url": "engine/stockfish-19-lite-single.js",
    "revision": "81cc4511ffb3f02a40da47fcb1413cc5"
  }, {
    "url": "engine/stockfish-19-lite-single.wasm",
    "revision": "c56761eebb1beb83d680f58428ed6286"
  }, {
    "url": "engine/stockfish.js",
    "revision": "81cc4511ffb3f02a40da47fcb1413cc5"
  }, {
    "url": "engine/stockfish.wasm",
    "revision": "c56761eebb1beb83d680f58428ed6286"
  }, {
    "url": "fonts/jetbrains-mono-latin.woff2",
    "revision": "b636a65da4f00129f08c7df6e5dd75ac"
  }, {
    "url": "fonts/plus-jakarta-sans-latin.woff2",
    "revision": "7660bd9909fb097989b19471a75f1b7a"
  }, {
    "url": "manifest.webmanifest",
    "revision": "6e1516fd5c5374b07422ab8c6092c8cf"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));

}));
