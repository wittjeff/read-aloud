
(function() {
  const isMainFrame = window.self === window.top;
  const frameInfo = {
    isMainFrame: isMainFrame,
    frameId: Math.random().toString(36).substr(2, 9),
    url: location.href,
    title: document.title
  };
  
  // Re-enable iframe functionality with better coordination
  const ENABLE_IFRAME_SUPPORT = true;
  const IFRAME_TIMEOUT_MS = 2000;
  
  // Prevent multiple simultaneous iframe processing
  let iframeProcessingInProgress = false;
  let cachedIframeResult = null;
  
  // Clear cache when page visibility changes (user navigates away/back)
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      cachedIframeResult = null;
      console.log("Read-Aloud: Cleared iframe cache on page visibility change");
    }
  });

  registerMessageListener("contentScript", {
    getRequireJs: getRequireJs,
    getDocumentInfo: getInfo,
    getCurrentIndex: getCurrentIndex,
    getTexts: getTexts,
    getFrameTexts: getFrameTexts,
    getFrameInfo: getFrameInfo,
    clearCache: clearIframeCache
  })

  if (ENABLE_IFRAME_SUPPORT) {
    if (isMainFrame) {
      initMainFrameCoordinator();
    } else {
      initChildFrame();
    }
  }

  function getFrameInfo() {
    return frameInfo;
  }

  function clearIframeCache() {
    cachedIframeResult = null;
    iframeProcessingInProgress = false;
    console.log("Read-Aloud: Cache cleared via clearCache call");
    return true;
  }

  function getInfo() {
    return {
      url: location.href,
      title: document.title,
      lang: getLang(),
    }
  }

  function getLang() {
    var lang = document.documentElement.lang || $("html").attr("xml:lang");
    if (lang) lang = lang.split(",",1)[0].replace(/_/g, '-');
    return lang;
  }

  function getRequireJs() {
    if (location.hostname == "docs.google.com") {
      if (/^\/presentation\/d\//.test(location.pathname)) return ["js/content/google-slides.js"];
      else if (/\/document\/d\//.test(location.pathname)) return ["js/content/googleDocsUtil.js", "js/content/google-doc.js"];
      else if ($(".drive-viewer-paginated-scrollable").length) return ["js/content/google-drive-doc.js"];
      else return ["js/content/html-doc.js"];
    }
    else if (location.hostname == "drive.google.com") {
      if ($(".drive-viewer-paginated-scrollable").length) return ["js/content/google-drive-doc.js"];
      else return ["js/content/google-drive-preview.js"];
    }
    else if (location.hostname == "onedrive.live.com" && $(".OneUp-pdf--loaded").length) return ["js/content/onedrive-doc.js"];
    else if (/^read\.amazon\./.test(location.hostname)) return ["js/content/kindle-book.js"];
    else if (location.hostname.endsWith(".khanacademy.org")) return ["js/content/khan-academy.js"];
    else if (location.hostname.endsWith("acrobatiq.com")) return ["js/content/html-doc.js", "js/content/acrobatiq.js"];
    else if (location.hostname == "digital.wwnorton.com") return ["js/content/html-doc.js", "js/content/wwnorton.js"];
    else if (location.hostname == "plus.pearson.com") return ["js/content/html-doc.js", "js/content/pearson.js"];
    else if (location.hostname == "www.ixl.com") return ["js/content/ixl.js"];
    else if (location.hostname == "www.webnovel.com" && location.pathname.startsWith("/book/")) return ["js/content/webnovel.js"];
    else if (location.hostname == "archiveofourown.org") return ["js/content/archiveofourown.js"];
    else if (location.hostname == "chat.openai.com") return ["js/content/chatgpt.js"];
    else if (location.pathname.match(/readaloud\.html$/)
      || location.pathname.match(/\.pdf$/)
      || $("embed[type='application/pdf']").length
      || $("iframe[src*='.pdf']").length) return ["js/content/pdf-doc.js"];
    else if (/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)
        && location.port === "1122"
        && location.protocol === "http:"
        && location.pathname === "/bookshelf/index.html") return  ["js/content/yd-app-web.js"];
    else return ["js/content/html-doc.js"];
  }

  async function getCurrentIndex() {
    if (await getSelectedText()) return -100;
    else return readAloudDoc.getCurrentIndex();
  }

  async function getTexts(index, quietly) {
    if (index < 0) {
      if (index == -100) return (await getSelectedText()).split(paragraphSplitter);
      else return null;
    }
    else {
      // Get main frame texts first
      const mainFrameTexts = await Promise.resolve(readAloudDoc.getTexts(index, quietly))
        .then(function(texts) {
          if (texts && Array.isArray(texts)) {
            if (!quietly) console.log("Main frame texts found:", texts.length, "blocks");
          }
          return texts || [];
        });

      // If we're in the main frame and iframe support is enabled, try to enhance with iframe content
      if (isMainFrame && ENABLE_IFRAME_SUPPORT && mainFrameTexts.length > 0) {
        // Use cached result if available to prevent multiple processing
        if (cachedIframeResult) {
          console.log("Read-Aloud: Using cached iframe result");
          return cachedIframeResult;
        }
        
        if (!iframeProcessingInProgress) {
          console.log("Read-Aloud: Main frame detected, checking for accessible iframes...");
          iframeProcessingInProgress = true;
          try {
            const enhancedTexts = await getTextsWithFrames(mainFrameTexts, index, quietly);
            cachedIframeResult = enhancedTexts; // Cache the result
            console.log("Read-Aloud: FINAL RESULT CACHED AND RETURNING:", enhancedTexts.length, "texts");
            return enhancedTexts;
          } catch (error) {
            console.warn("Read-Aloud: Failed to get iframe texts, using main frame only:", error.message);
            cachedIframeResult = mainFrameTexts; // Cache the fallback
            return mainFrameTexts;
          } finally {
            iframeProcessingInProgress = false;
          }
        } else {
          console.log("Read-Aloud: Iframe processing in progress, returning main frame only");
          return mainFrameTexts;
        }
      }
      
      return mainFrameTexts;
    }
  }

  async function getFrameTexts(index, quietly) {
    return Promise.resolve(readAloudDoc.getTexts(index, quietly))
      .then(function(texts) {
        return texts || [];
      })
  }

  function getSelectedText() {
    if (readAloudDoc.getSelectedText) return readAloudDoc.getSelectedText()
    return window.getSelection().toString().trim();
  }


  getSettings()
    .then(settings => {
      if (settings.fixBtSilenceGap)
        setInterval(updateSilenceTrack.bind(null, Math.random()), 5000)
    })

  async function updateSilenceTrack(providerId) {
    if (!audioCanPlay()) return;
    const silenceTrack = getSilenceTrack()
    try {
      const should = await sendToPlayer({method: "shouldPlaySilence", args: [providerId]})
      if (should) silenceTrack.start()
      else silenceTrack.stop()
    }
    catch (err) {
      silenceTrack.stop()
    }
  }

  function audioCanPlay() {
    return navigator.userActivation && navigator.userActivation.hasBeenActive
  }

  async function sendToPlayer(message) {
    message.dest = "player"
    const result = await brapi.runtime.sendMessage(message)
    if (result && result.error) throw result.error
    else return result
  }
  function initMainFrameCoordinator() {
    console.log("Read-Aloud: Main frame coordinator initialized");
  }

  function initChildFrame() {
    console.log("Read-Aloud: Child frame initialized", frameInfo.frameId, "URL:", location.href);
    
    // Listen for messages from parent frame
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'readAloudFrameRequest') {
        console.log("Read-Aloud: Child frame received request:", event.data);
        handleFrameRequest(event.data, event.source);
      }
    });
  }

  async function handleFrameRequest(request, source) {
    console.log("Read-Aloud: Handling frame request method:", request.method);
    try {
      let response;
      switch (request.method) {
        case 'getFrameTexts':
          console.log("Read-Aloud: Getting frame texts for index:", request.index);
          response = await getFrameTexts(request.index, request.quietly);
          console.log("Read-Aloud: Frame texts result:", response?.length, "items");
          break;
        case 'getFrameInfo':
          response = getFrameInfo();
          break;
        default:
          throw new Error('Unknown method: ' + request.method);
      }
      
      console.log("Read-Aloud: Sending successful response for requestId:", request.requestId);
      source.postMessage({
        type: 'readAloudFrameResponse',
        requestId: request.requestId,
        success: true,
        data: response
      }, '*');
    } catch (error) {
      console.error("Read-Aloud: Error handling frame request:", error);
      source.postMessage({
        type: 'readAloudFrameResponse',
        requestId: request.requestId,
        success: false,
        error: error.message
      }, '*');
    }
  }

  async function getTextsWithFrames(mainFrameTexts, index, quietly) {
    console.log("Read-Aloud: Starting document order traversal for iframe integration");
    
    // Get iframe data first
    const allIframes = document.querySelectorAll('iframe');
    console.log("Read-Aloud: Found", allIframes.length, "total iframes");
    
    if (allIframes.length === 0) {
      console.log("Read-Aloud: No iframes found, returning main frame texts only");
      return mainFrameTexts;
    }

    // Process all accessible iframes and get their texts
    const iframeTextMap = new Map();
    const accessibleIframes = [];
    
    for (let i = 0; i < allIframes.length; i++) {
      const iframe = allIframes[i];
      const sameOrigin = isSameOrigin(iframe.src);
      
      let actuallyAccessible = false;
      try {
        const testDoc = iframe.contentDocument || iframe.contentWindow?.document;
        actuallyAccessible = !!testDoc;
      } catch (e) {
        // Cross-origin, skip
      }
      
      if (sameOrigin || !iframe.src || actuallyAccessible) {
        console.log(`Processing accessible iframe ${i}`);
        try {
          const iframeTexts = await getTextsFromFrame(iframe, index, quietly);
          if (iframeTexts && iframeTexts.length > 0) {
            iframeTextMap.set(iframe, iframeTexts);
            accessibleIframes.push(iframe);
            console.log(`Iframe ${i}: got ${iframeTexts.length} texts`);
          }
        } catch (error) {
          console.warn(`Failed to get texts from iframe ${i}:`, error.message);
        }
      } else {
        console.log(`Skipping cross-origin iframe ${i}`);
      }
    }

    if (iframeTextMap.size === 0) {
      console.log("Read-Aloud: No accessible iframe content found");
      return mainFrameTexts;
    }

    // Now traverse the document in order and build the final text array
    console.log("Read-Aloud: Building document-order text array");
    return buildDocumentOrderTexts(iframeTextMap);
  }

  function buildDocumentOrderTexts(iframeTextMap) {
    const result = [];
    
    // Traverse all top-level elements in document order
    const topLevelElements = Array.from(document.body?.children || document.documentElement?.children || []);
    
    for (const element of topLevelElements) {
      if (element.tagName === 'IFRAME') {
        // Insert iframe content
        const iframeTexts = iframeTextMap.get(element);
        if (iframeTexts && iframeTexts.length > 0) {
          console.log("Read-Aloud: Inserting iframe content in document order");
          result.push(""); // Separator
          result.push(...iframeTexts);
        }
      } else {
        // Get text from this element (excluding iframes)
        const elementText = getTextFromElement(element);
        if (elementText && elementText.length > 0) {
          result.push(...elementText);
        }
      }
    }

    console.log("Read-Aloud: Document order result:", result.length, "text blocks");
    console.log("Read-Aloud: DOCUMENT ORDER TEXTS:", result);
    
    return result;
  }

  function getTextFromElement(element) {
    // Extract text from an element, excluding iframe content
    const texts = [];
    const ignoreTags = "select, textarea, button, label, audio, video, dialog, embed, menu, nav, noframes, noscript, object, script, style, svg, aside, footer, #footer, .no-read-aloud, [aria-hidden=true], iframe";
    
    // Skip if this element should be ignored
    if (element.matches && element.matches(ignoreTags)) {
      return texts;
    }
    
    // Get text content, but exclude iframe elements
    const walker = element.ownerDocument.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // Skip ignored elements including iframes
          if (parent.closest(ignoreTags)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Only accept nodes with meaningful text
          const text = node.textContent.trim();
          if (text.length < 3) return NodeFilter.FILTER_REJECT;
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    const seenTexts = new Set();
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text && !seenTexts.has(text)) {
        seenTexts.add(text);
        texts.push(text);
      }
    }

    return texts;
  }

  async function processIframe(iframe, frameIndex, index, quietly) {
    try {
      console.log("Read-Aloud: Processing iframe", frameIndex, "src:", iframe.src);
      const frameTexts = await getTextsFromFrame(iframe, index, quietly);
      if (frameTexts && frameTexts.length > 0) {
        console.log("Read-Aloud: Got", frameTexts.length, "texts from iframe", frameIndex);
        return {
          frameIndex: frameIndex,
          texts: frameTexts,
          url: iframe.src
        };
      } else {
        console.log("Read-Aloud: No texts from iframe", frameIndex);
        return null;
      }
    } catch (error) {
      console.warn('Read-Aloud: Could not access iframe', frameIndex, error.message);
      throw error;
    }
  }

  function getTextsFromFrame(iframe, index, quietly) {
    return new Promise((resolve, reject) => {
      // Check if iframe is accessible
      if (!iframe || !iframe.contentWindow) {
        reject(new Error('Iframe not accessible - no contentWindow'));
        return;
      }

      // Check if iframe is from same origin and try direct text extraction
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) {
          reject(new Error('Iframe document not accessible - likely cross-origin'));
          return;
        }
        
        console.log("Read-Aloud: Iframe is same-origin, attempting direct text extraction");
        
        // Try direct text extraction from iframe
        try {
          const texts = extractTextsDirectly(iframeDoc);
          console.log("Read-Aloud: Direct extraction got", texts.length, "texts from iframe");
          console.log("Read-Aloud: Iframe texts:", texts.slice(0, 3)); // Show first 3 texts
          resolve(texts);
          return;
        } catch (directError) {
          console.warn("Read-Aloud: Direct extraction failed:", directError.message);
          // Fall back to postMessage approach if direct extraction fails
        }
        
      } catch (error) {
        reject(new Error('Iframe not accessible - cross-origin restriction: ' + error.message));
        return;
      }

      // Fallback: try postMessage approach (original logic)
      const requestId = Math.random().toString(36).substring(2, 9);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for iframe response'));
      }, 500);

      function handleResponse(event) {
        if (event.data && 
            event.data.type === 'readAloudFrameResponse' && 
            event.data.requestId === requestId) {
          cleanup();
          if (event.data.success) {
            console.log("Read-Aloud: Received response from iframe:", event.data.data?.length, "texts");
            resolve(event.data.data || []);
          } else {
            reject(new Error(event.data.error || 'Unknown iframe error'));
          }
        }
      }

      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener('message', handleResponse);
      }

      window.addEventListener('message', handleResponse);

      try {
        console.log("Read-Aloud: Fallback to postMessage for iframe");
        iframe.contentWindow.postMessage({
          type: 'readAloudFrameRequest',
          requestId: requestId,
          method: 'getFrameTexts',
          index: index,
          quietly: quietly
        }, '*');
      } catch (error) {
        cleanup();
        reject(new Error('Failed to send message to iframe: ' + error.message));
      }
    });
  }

  function extractTextsDirectly(iframeDoc) {
    console.log("Read-Aloud: Starting direct text extraction from iframe document");
    console.log("Read-Aloud: Iframe document body exists:", !!iframeDoc.body);
    console.log("Read-Aloud: Iframe document URL:", iframeDoc.URL);
    
    // Simple direct text extraction without relying on content scripts
    const ignoreTags = "select, textarea, button, label, audio, video, dialog, embed, menu, nav, noframes, noscript, object, script, style, svg, aside, footer, #footer, .no-read-aloud, [aria-hidden=true]";
    
    // Try simple text extraction first
    const bodyText = iframeDoc.body?.innerText || iframeDoc.documentElement?.innerText || '';
    console.log("Read-Aloud: Simple body text length:", bodyText.length);
    console.log("Read-Aloud: Sample body text:", bodyText.substring(0, 200));
    
    if (bodyText.trim().length > 0) {
      // Split into paragraphs - be more liberal with what we consider a paragraph
      const paragraphs = bodyText.split(/\n\s*\n/).filter(p => p.trim().length > 3);
      console.log("Read-Aloud: Found", paragraphs.length, "paragraphs via simple extraction");
      console.log("Read-Aloud: Paragraphs:", paragraphs);
      if (paragraphs.length > 0) {
        return paragraphs;
      }
      
      // If no paragraph breaks, split by lines as fallback
      const lines = bodyText.split(/\n/).filter(line => line.trim().length > 10);
      console.log("Read-Aloud: Falling back to line splitting:", lines.length, "lines");
      if (lines.length > 0) {
        return lines;
      }
      
      // If still nothing, return the whole text as one block
      return [bodyText.trim()];
    }
    
    // Fallback to tree walker
    console.log("Read-Aloud: Falling back to TreeWalker approach");
    const walker = iframeDoc.createTreeWalker(
      iframeDoc.body || iframeDoc.documentElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // Skip ignored elements
          if (parent.matches && parent.matches(ignoreTags)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Only accept nodes with meaningful text
          const text = node.textContent.trim();
          if (text.length < 3) return NodeFilter.FILTER_REJECT;
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const texts = [];
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text && texts.indexOf(text) === -1) { // Avoid duplicates
        texts.push(text);
      }
    }

    console.log("Read-Aloud: TreeWalker found", texts.length, "text nodes");
    return texts.filter(text => text.length > 0);
  }

  function isSameOrigin(url) {
    if (!url) return true; // Empty src might be same origin
    try {
      const iframeUrl = new URL(url, window.location.href);
      return iframeUrl.origin === window.location.origin;
    } catch (error) {
      return false;
    }
  }
})()


//helpers --------------------------

var paragraphSplitter = /(?:\s*\r?\n\s*){2,}/;

function getInnerText(elem) {
  var text = elem.innerText;
  return text ? text.trim() : "";
}

function isNotEmpty(text) {
  return text;
}

function fixParagraphs(texts) {
  var out = [];
  var para = "";
  for (var i=0; i<texts.length; i++) {
    if (!texts[i]) {
      if (para) {
        out.push(para);
        para = "";
      }
      continue;
    }
    if (para) {
      if (/[-\u2013\u2014]$/.test(para)) para = para.substr(0, para.length-1);
      else para += " ";
    }
    para += texts[i].replace(/[-\u2013\u2014]\r?\n/g, "");
    if (texts[i].match(/[.!?:)"'\u2019\u201d]$/)) {
      out.push(para);
      para = "";
    }
  }
  if (para) out.push(para);
  return out;
}

function tryGetTexts(getTexts, millis) {
  return waitMillis(500)
    .then(getTexts)
    .then(function(texts) {
      if (texts && !texts.length && millis-500 > 0) return tryGetTexts(getTexts, millis-500);
      else return texts;
    })
}

function loadPageScript(url) {
  if (!$("head").length) $("<head>").prependTo("html");
  $.ajax({
    dataType: "script",
    cache: true,
    url: url
  });
}

function simulateMouseEvent(element, eventName, coordX, coordY) {
  element.dispatchEvent(new MouseEvent(eventName, {
    view: window,
    bubbles: true,
    cancelable: true,
    clientX: coordX,
    clientY: coordY,
    button: 0
  }));
}

function simulateClick(elementToClick) {
  var box = elementToClick.getBoundingClientRect(),
      coordX = box.left + (box.right - box.left) / 2,
      coordY = box.top + (box.bottom - box.top) / 2;
  simulateMouseEvent (elementToClick, "mousedown", coordX, coordY);
  simulateMouseEvent (elementToClick, "mouseup", coordX, coordY);
  simulateMouseEvent (elementToClick, "click", coordX, coordY);
}

const getMath = (function() {
  let promise = Promise.resolve(null)
  return () => promise = promise.then(math => math || makeMath())
})();

async function makeMath() {
  const getXmlFromMathEl = function(mathEl) {
    const clone = mathEl.cloneNode(true)
    $("annotation, annotation-xml", clone).remove()
    removeAllAttrs(clone, true)
    return clone.outerHTML
  }

  //determine the mml markup
  const math =
    when(document.querySelector(".MathJax, .MathJax_Preview"), {
      selector: ".MathJax[data-mathml]",
      getXML(el) {
        const mathEl = el.querySelector("math")
        return mathEl ? getXmlFromMathEl(mathEl) : el.getAttribute("data-mathml")
      },
    })
    .when(() => document.querySelector("math"), {
      selector: "math",
      getXML: getXmlFromMathEl,
    })
    .else(null)

  if (!math) return null
  const elems = $(math.selector).get()
  if (!elems.length) return null

  //create speech surrogates
  try {
    const xmls = elems.map(math.getXML)
    const texts = await ajaxPost(config.serviceUrl + "/read-aloud/mathml", xmls, "json").then(JSON.parse)
    elems.forEach((el, i) => $("<span>").addClass("readaloud-mathml").text(texts[i] || "math expression").insertBefore(el))
  }
  catch (err) {
    console.error(err)
    return {
      show() {},
      hide() {}
    }
  }

  //return functions to toggle between mml and speech
  return {
    show() {
      for (const el of elems) el.style.setProperty("display", "none", "important")
      $(".readaloud-mathml").show()
    },
    hide() {
      $(elems).css("display", "")
      $(".readaloud-mathml").hide()
    }
  }
}
