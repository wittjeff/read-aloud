
var readAloudDoc = new function() {
  var self = this;

  this.ignoreTags = "select, textarea, button, label, audio, video, dialog, embed, menu, nav, noframes, noscript, object, script, style, svg, aside, footer, #footer, .no-read-aloud, [aria-hidden=true]";

  this.getCurrentIndex = function() {
    return 0;
  }

  this.getTexts = async function(index) {
    if (index == 0) {
      const math = await getMath()
      try {
        if (math) math.show()
        return parse()
      }
      finally {
        if (math) math.hide()
      }
    }
    else return null;
  }

  this.getSelectedText = async function() {
    const math = await getMath()
    try {
      if (math) math.show()
      return window.getSelection().toString().trim()
    }
    finally {
      if (math) math.hide()
    }
  }



  function parse() {
    //find blocks containing text
    var start = new Date();
    var textBlocks = findTextBlocks(50);
    var countChars = textBlocks.reduce(function(sum, elem) {return sum + getInnerText(elem).length}, 0);
    console.log("Found", textBlocks.length, "blocks", countChars, "chars in", new Date()-start, "ms");

    if (countChars < 1000) {
      textBlocks = findTextBlocks(3);
      var texts = textBlocks.map(getInnerText);
      console.log("Using lower threshold, found", textBlocks.length, "blocks", texts.join("").length, "chars");

      //trim the head and the tail
      var head, tail;
      for (var i=3; i<texts.length && !head; i++) {
        var dist = getGaussian(texts, 0, i);
        if (texts[i].length > dist.mean + 2*dist.stdev) head = i;
      }
      for (var i=texts.length-4; i>=0 && !tail; i--) {
        var dist = getGaussian(texts, i+1, texts.length);
        if (texts[i].length > dist.mean + 2*dist.stdev) tail = i+1;
      }
      if (head||tail) {
        textBlocks = textBlocks.slice(head||0, tail);
        console.log("Trimmed", head, tail);
      }
    }

    //mark the elements to be read
    var toRead = [];
    for (var i=0; i<textBlocks.length; i++) {
      toRead.push.apply(toRead, findHeadingsFor(textBlocks[i], textBlocks[i-1]));
      toRead.push(textBlocks[i]);
    }
    $(toRead).addClass("read-aloud");   //for debugging only

    //extract texts with iframe integration
    return extractTextsWithIframes(toRead);
  }

  function extractTextsWithIframes(toRead) {
    // First get the normal text extraction
    var normalTexts = toRead.flatMap(getTexts).filter(isNotEmpty);
    
    // Then apply document-order iframe integration
    return buildDocumentOrderTexts(normalTexts);
  }
  
  function buildDocumentOrderTexts(normalTexts) {
    var result = [];
    var iframeTextMap = new Map();
    
    // First, extract iframe content and map it to iframe elements
    var iframes = document.querySelectorAll('iframe');
    console.log("Read-Aloud: Found", iframes.length, "iframes for document order integration");
    
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      var iframeTexts = getIframeTextsFromElement(iframe);
      if (iframeTexts && iframeTexts.length > 0) {
        iframeTextMap.set(iframe, iframeTexts);
        console.log("Read-Aloud: Mapped", iframeTexts.length, "texts to iframe", i);
      }
    }
    
    if (iframeTextMap.size === 0) {
      console.log("Read-Aloud: No iframe content found, using normal texts");
      return normalTexts;
    }
    
    // Traverse all top-level elements in document order
    var topLevelElements = Array.from(document.body?.children || document.documentElement?.children || []);
    
    for (var i = 0; i < topLevelElements.length; i++) {
      var element = topLevelElements[i];
      
      if (element.tagName === 'IFRAME') {
        // Insert iframe content
        var iframeTexts = iframeTextMap.get(element);
        if (iframeTexts && iframeTexts.length > 0) {
          console.log("Read-Aloud: Inserting iframe content in document order");
          result.push(""); // Separator
          result = result.concat(iframeTexts);
        }
      } else {
        // Get text from this element (excluding iframes)
        var elementTexts = getTextFromElement(element);
        if (elementTexts && elementTexts.length > 0) {
          result = result.concat(elementTexts);
        }
      }
    }
    
    console.log("Read-Aloud: Document order result:", result.length, "text blocks");
    console.log("Read-Aloud: DOCUMENT ORDER TEXTS:", result);
    
    return result.filter(isNotEmpty);
  }
  
  function getTextFromElement(element) {
    // Extract text from an element, excluding iframe content
    var texts = [];
    var ignoreTags = "select, textarea, button, label, audio, video, dialog, embed, menu, nav, noframes, noscript, object, script, style, svg, aside, footer, #footer, .no-read-aloud, [aria-hidden=true], iframe";
    
    // Skip if this element should be ignored
    if (element.matches && element.matches(ignoreTags)) {
      return texts;
    }
    
    // Get text content, but exclude iframe elements
    var walker = element.ownerDocument.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          var parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // Skip ignored elements including iframes
          if (parent.closest(ignoreTags)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Only accept nodes with meaningful text
          var text = node.textContent.trim();
          if (text.length < 3) return NodeFilter.FILTER_REJECT;
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    var node;
    var seenTexts = new Set();
    while (node = walker.nextNode()) {
      var text = node.textContent.trim();
      if (text && !seenTexts.has(text)) {
        seenTexts.add(text);
        texts.push(text);
      }
    }

    return texts;
  }

  function getIframeTextsFromElement(iframe) {
    try {
      // Only try direct same-origin access for safety
      var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc && iframeDoc.body) {
        var bodyText = iframeDoc.body.innerText || iframeDoc.body.textContent || '';
        if (bodyText.trim().length > 10) {
          // Split into basic paragraphs
          var paragraphs = bodyText.split(/\n\s*\n/).filter(function(p) { 
            return p.trim().length > 3; 
          });
          if (paragraphs.length > 0) {
            return paragraphs;
          } else if (bodyText.trim().length > 0) {
            return [bodyText.trim()];
          }
        }
      }
    } catch (error) {
      // Cross-origin or access denied - skip silently
      console.log("Read-Aloud: Skipping iframe (cross-origin or access denied)");
    }
    return [];
  }


  function findTextBlocks(threshold) {
    var skipTags = "h1, h2, h3, h4, h5, h6, p, a[href], " + self.ignoreTags;
    var isTextNode = function(node) {
      return node.nodeType == 3 && node.nodeValue.trim().length >= 3;
    };
    var isParagraph = function(node) {
      return node.nodeType == 1 && $(node).is("p:visible") && getInnerText(node).length >= threshold;
    };
    var hasTextNodes = function(elem) {
      return someChildNodes(elem, isTextNode) && getInnerText(elem).length >= threshold;
    };
    var hasParagraphs = function(elem) {
      return someChildNodes(elem, isParagraph);
    };
    var containsTextBlocks = function(elem) {
      var childElems = $(elem).children(":not(" + skipTags + ")").get();
      return childElems.some(hasTextNodes) || childElems.some(hasParagraphs) || childElems.some(containsTextBlocks);
    };
    var addBlock = function(elem, multi) {
      if (multi) $(elem).data("read-aloud-multi-block", true);
      textBlocks.push(elem);
    };
    var walk = function() {
      if ($(this).is("frame, iframe")) try {walk.call(this.contentDocument.body)} catch(err) {}
      else if ($(this).is("dl")) addBlock(this);
      else if ($(this).is("ol, ul")) {
        var items = $(this).children().get();
        if (items.some(hasTextNodes)) addBlock(this);
        else if (items.some(hasParagraphs)) addBlock(this, true);
        else if (items.some(containsTextBlocks)) addBlock(this, true);
      }
      else if ($(this).is("tbody")) {
        var rows = $(this).children();
        if (rows.length > 3 || rows.eq(0).children().length > 3) {
          if (rows.get().some(containsTextBlocks)) addBlock(this, true);
        }
        else rows.each(walk);
      }
      else {
        if (hasTextNodes(this)) addBlock(this);
        else if (hasParagraphs(this)) addBlock(this, true);
        else $(this).add(this.shadowRoot).children(":not(" + skipTags + ")").each(walk);
      }
    };
    var textBlocks = [];
    walk.call(document.body);
    return textBlocks.filter(function(elem) {
      return $(elem).is(":visible") && $(elem).offset().left >= 0;
    })
  }

  function getGaussian(texts, start, end) {
    if (start == undefined) start = 0;
    if (end == undefined) end = texts.length;
    var sum = 0;
    for (var i=start; i<end; i++) sum += texts[i].length;
    var mean = sum / (end-start);
    var variance = 0;
    for (var i=start; i<end; i++) variance += (texts[i].length-mean)*(texts[i].length-mean);
    return {mean: mean, stdev: Math.sqrt(variance)};
  }

  function getTexts(elem) {
    var toHide = $(elem).find(":visible").filter(dontRead).hide();
    $(elem).find("ol, ul").addBack("ol, ul").each(addNumbering);
    var texts = $(elem).data("read-aloud-multi-block")
      ? $(elem).children(":visible").get().map(getText)
      : getText(elem).split(paragraphSplitter);
    $(elem).find(".read-aloud-numbering").remove();
    toHide.show();
    return texts;
  }

  function addNumbering() {
    var children = $(this).children();
    var text = children.length ? getInnerText(children.get(0)) : null;
    if (text && !text.match(/^[(]?(\d|[a-zA-Z][).])/))
      children.each(function(index) {
        $("<span>").addClass("read-aloud-numbering").text((index +1) + ". ").prependTo(this);
      })
  }

  function dontRead() {
    var float = $(this).css("float");
    var position = $(this).css("position");
    return $(this).is(self.ignoreTags) || $(this).is("sup") || float == "right" || position == "fixed";
  }

  function getText(elem) {
    return addMissingPunctuation(elem.innerText).trim();
  }

  function addMissingPunctuation(text) {
    return text.replace(/(\w)(\s*?\r?\n)/g, "$1.$2");
  }

  function findHeadingsFor(block, prevBlock) {
    var result = [];
    var firstInnerElem = $(block).find("h1, h2, h3, h4, h5, h6, p").filter(":visible").get(0);
    var currentLevel = getHeadingLevel(firstInnerElem);
    var node = previousNode(block, true);
    while (node && node != prevBlock) {
      var ignore = $(node).is(self.ignoreTags);
      if (!ignore && node.nodeType == 1 && $(node).is(":visible")) {
        var level = getHeadingLevel(node);
        if (level < currentLevel) {
          result.push(node);
          currentLevel = level;
        }
      }
      node = previousNode(node, ignore);
    }
    return result.reverse();
  }

  function getHeadingLevel(elem) {
    var matches = elem && /^H(\d)$/i.exec(elem.tagName);
    return matches ? Number(matches[1]) : 100;
  }

  function previousNode(node, skipChildren) {
    if ($(node).is('body')) return null;
    if (node.nodeType == 1 && !skipChildren && node.lastChild) return node.lastChild;
    if (node.previousSibling) return node.previousSibling;
    if (node.parentNode) return previousNode(node.parentNode, true);
    return null;
  }

  function someChildNodes(elem, test) {
    var child = elem.firstChild;
    while (child) {
      if (test(child)) return true;
      child = child.nextSibling;
    }
    return false;
  }
}
