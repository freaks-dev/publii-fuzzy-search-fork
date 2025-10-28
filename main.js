class StaticFuzzySearchPlugin {
  constructor(API, name, config) {
    this.API = API;
    this.name = name;
    this.config = config;

    // collected posts during rendering (for index generation)
    this.posts = [];
  }

  // Register insertion hooks and modifier/event hooks
  addInsertions() {
    this.API.addInsertion('customSearchInput', this.addSearchInput, 1, this);
    this.API.addInsertion('customSearchContent', this.addSearchContent, 1, this);
  }

  addModifiers() {
    // collect post data while renderer emits postItemData
    this.API.addModifier('postItemData', this.collectPostData.bind(this), 10, this);

    // after render, write index file
    this.API.addEvent('afterRender', this.generateIndexFile.bind(this), 20, this);
  }

  // Collect necessary fields for each post (called for every post)
  collectPostData(renderer, postData) {
    const entry = {
      url: postData.url,
      id: postData.id,
      title: postData.title
    };

    if (this.config.includeExcerpt === true || this.config.includeExcerpt === 'true') {
      entry.excerpt = postData.excerpt;
    }

    if (this.config.includeTags === true || this.config.includeTags === 'true') {
      entry.tags = (postData.tags || []).map(t => t.name);
    }

    if (this.config.includeAuthor === true || this.config.includeAuthor === 'true') {
      if (postData.author) {
        entry.author = postData.author.name;
      }
    }

    if (this.config.includeText === true || this.config.includeText === 'true') {
      // prefer postData.text if available; fallback to content_html if present
      entry.text = postData.text || postData.content_html || "";
    }

    this.posts.push(entry);
    return postData;
  }

  // Write generated index file to site root
  generateIndexFile(rendererInstance) {
    if (!this.posts || this.posts.length === 0) {
      // nothing to write
      return;
    }

    // Ensure fileName is something like "./search-index.json" or "search-index.json"
    let fileName = String(this.config.indexFileName || './search-index.json').trim();
    // Normalize leading './' for createFile path handling
    if (fileName.startsWith('./')) fileName = fileName.slice(2);

    const jsonIndex = JSON.stringify(this.posts, null, 2);

    // Write at site root
    this.API.createFile(`[ROOT-FILES]/${fileName}`, jsonIndex, this);

    // clear posts to avoid duplication if rendering runs again
    this.posts = [];
  }

  // Add search input form insertion
  addSearchInput(rendererInstance, context) {
    let searchUrl = '';
    if (rendererInstance.globalContext && rendererInstance.globalContext.website) {
      searchUrl = rendererInstance.globalContext.website.searchUrl || '';
    }

    const placeholder = this.config.searchPlaceholder || 'search...';
    const param = this.config.searchParam || 'q';

    let output = `<form action="${searchUrl}" class="search__form">
                     <input
                        class="search__input"
                        type="search"
                        name="${param}"
                        placeholder="${placeholder}" 
                        aria-label="${placeholder}"
                        required/>
                  </form>`;
    return output;
  }

  // Add full search page content + Fuse.js powered client script
  addSearchContent(rendererInstance, context) {
    const placeholder = this.config.searchPlaceholder || 'search...';
    const param = this.config.searchParam || 'q';

    // Determine whether frontend should use feed.json or generated index
    const useFeed = (this.config.useFeedJson === true || this.config.useFeedJson === 'true');
    const feedUrl = this.config.jsonFeedUrl || './feed.json';

    // Determine generated index URL relative to site root
    // Use same normalization as generateIndexFile: strip leading './'
    let indexFileName = String(this.config.indexFileName || './search-index.json').trim();
    if (indexFileName.startsWith('./')) indexFileName = indexFileName.slice(2);
    const generatedIndexUrl = `${rendererInstance.siteConfig.domain}/${indexFileName}`;

    // Build list of keys for Fuse based on included fields
    const keys = ['title'];
    if (this.config.includeExcerpt === true || this.config.includeExcerpt === 'true') keys.push('excerpt');
    if (this.config.includeText === true || this.config.includeText === 'true') keys.push('text');
    if (this.config.includeAuthor === true || this.config.includeAuthor === 'true') keys.push('author');
    if (this.config.includeTags === true || this.config.includeTags === 'true') keys.push('tags');

    // helper to coerce boolean-like settings into JS boolean literals for script injection
    const bool = (v) => (v === true || v === 'true') ? 'true' : 'false';
    const num = (v, fallback) => (v === undefined || v === null || v === '') ? fallback : v;

    const configJson = {
      keys: keys,
      isCaseSensitive: (this.config.isCaseSensitive === true || this.config.isCaseSensitive === 'true'),
      includeScore: (this.config.includeScore === true || this.config.includeScore === 'true'),
      includeMatches: (this.config.includeMatches === true || this.config.includeMatches === 'true'),
      findAllMatches: (this.config.findAllMatches === true || this.config.findAllMatches === 'true'),
      minMatchCharLength: Number(this.config.minMatchCharLength || 2),
      shouldSort: (this.config.shouldSort === true || this.config.shouldSort === 'true'),
      ignoreLocation: (this.config.ignoreLocation === true || this.config.ignoreLocation === 'true'),
      ignoreDiacritics: (this.config.ignoreDiacritics === true || this.config.ignoreDiacritics === 'true'),
      useExtendedSearch: (this.config.useExtendedSearch === true || this.config.useExtendedSearch === 'true'),
      threshold: Number(this.config.threshold || 0.6),
      location: Number(this.config.location || 0),
      fieldNormWeight: Number(this.config.fieldNormWeight || 1),
      ignoreFieldNorm: (this.config.ignoreFieldNorm === true || this.config.ignoreFieldNorm === 'true'),
      distance: Number(this.config.distance || 100)
    };

    // choose dataUrl at runtime based on useFeed flag
    const dataUrlForScript = useFeed ? feedUrl : `${indexFileName}`;

    // The script references the plugin's bundled fuse.js via the plugin media path
    const fuseScriptUrl = `${rendererInstance.siteConfig.domain}/media/plugins/staticFuzzySearch/fuse.js`;

    // Render HTML + script
    const output = `
      <form action="javascript:void(0);" class="search-page-form" onsubmit="return false;">
        <input
          type="search"
          id="live-search-input"
          placeholder="${placeholder}"
          class="search-page-input"
          required />
      </form>

      <div id="search-results"></div>

      <script src="${fuseScriptUrl}"></script>
      <script>
        (async function () {
          const searchInput = document.getElementById("live-search-input");
          const resultsContainer = document.getElementById("search-results");
          const paramName = "${param}";
          const dataUrl = "${dataUrlForScript}";

          // Fuse options injected from plugin config
          const fuseOptions = {
            keys: ${JSON.stringify(configJson.keys)},
            isCaseSensitive: ${JSON.stringify(configJson.isCaseSensitive)},
            includeScore: ${JSON.stringify(configJson.includeScore)},
            includeMatches: ${JSON.stringify(configJson.includeMatches)},
            findAllMatches: ${JSON.stringify(configJson.findAllMatches)},
            minMatchCharLength: ${JSON.stringify(configJson.minMatchCharLength)},
            shouldSort: ${JSON.stringify(configJson.shouldSort)},
            ignoreLocation: ${JSON.stringify(configJson.ignoreLocation)},
            ignoreDiacritics: ${JSON.stringify(configJson.ignoreDiacritics)},
            useExtendedSearch: ${JSON.stringify(configJson.useExtendedSearch)},
            threshold: ${JSON.stringify(configJson.threshold)},
            location: ${JSON.stringify(configJson.location)},
            fieldNormWeight: ${JSON.stringify(configJson.fieldNormWeight)},
            ignoreFieldNorm: ${JSON.stringify(configJson.ignoreFieldNorm)},
            distance: ${JSON.stringify(configJson.distance)}
          };

          // Helpers for highlighting
          function highlightMatches(text, matches, key) {
            if (!matches) return text;
            const match = matches.find(m => m.key === key);
            if (!match || !Array.isArray(match.indices)) return text;

            let offset = 0;
            let highlighted = text;

            match.indices.forEach(([start, end]) => {
              const realStart = start + offset;
              const realEnd = end + offset + 1;

              const original = highlighted.slice(realStart, realEnd);
              const replacement = "<mark>" + original + "</mark>";

              highlighted = highlighted.slice(0, realStart) + replacement + highlighted.slice(realEnd);

              offset += "<mark></mark>".length;
            });

            return highlighted;
          }

          function renderResults(results) {
            resultsContainer.innerHTML = "";

            if (!results || results.length === 0) {
              resultsContainer.innerHTML = "<p>No Results Found</p>";
              return;
            }

            results.forEach(result => {
              const item = result.item;
              const title = highlightMatches(item.title || "", result.matches, "title");
              const excerptKey = ${JSON.stringify(configJson.keys)}.includes('excerpt') ? 'excerpt' : (${JSON.stringify(configJson.keys)}.includes('text') ? 'text' : null);
              const summary = excerptKey ? highlightMatches(item[excerptKey] || "", result.matches, excerptKey) : "";

              const url = item.url || "#";

              const resultHTML = \`
                <div class="search-result-item">
                  <h5><a href="\${url}">\${title}</a></h5>
                  <p>\${summary}</p>
                </div>
              \`;
              resultsContainer.innerHTML += resultHTML;
            });
          }

          function performSearch(term) {
            if (!term || term.length < 2) {
              resultsContainer.innerHTML = "";
              return;
            }
            // update query param without reload
            history.replaceState(null, "", "?${this.config.searchParam}=" + encodeURIComponent(term));

            const results = fuse.search(term);
            renderResults(results);
          }

          // fetch data and initialize Fuse
          let items = [];
          try {
            const resp = await fetch(dataUrl);
            const json = await resp.json();
            // when using feed.json, item array may be under json.items
            items = Array.isArray(json) ? json : (Array.isArray(json.items) ? json.items : []);
          } catch (e) {
            resultsContainer.innerHTML = "<p>Failed to load search data.</p>";
            console.error("Failed to load search data:", e);
            return;
          }

          // If feed.json has different field names than generated index, try to normalize minimal fields
          // The generated index is expected to have: url, id, title, excerpt/text, tags, author
          // But feed.json items usually contain e.g. title, summary, content_html, tags, author, url
          // We'll normalize feed.json items to the expected keys if needed.
          const normalizedItems = items.map(it => {
            // if it already looks like generated index (has title and (excerpt or text) and url), keep as is
            const copy = Object.assign({}, it);

            if (!copy.title && copy.title !== '') {
              copy.title = it.title || it.name || "";
            }

            // feed.json uses 'summary' or 'content_html' -> map to excerpt/text fields if our keys expect them
            if (${JSON.stringify(configJson.keys)}.includes('excerpt')) {
              copy.excerpt = copy.excerpt || copy.summary || "";
            }
            if (${JSON.stringify(configJson.keys)}.includes('text')) {
              copy.text = copy.text || copy.content_html || "";
            }

            if (${JSON.stringify(configJson.keys)}.includes('author')) {
              // feed.json might have author as object or string
              if (!copy.author) {
                if (it.author && typeof it.author === 'object') copy.author = it.author.name || "";
                else copy.author = it.author || "";
              }
            }

            if (${JSON.stringify(configJson.keys)}.includes('tags')) {
              if (!copy.tags) {
                // feed.json tags may be an array of objects
                if (Array.isArray(it.tags)) {
                  copy.tags = it.tags.map(t => (typeof t === 'object' ? (t.name || t) : t));
                } else {
                  copy.tags = [];
                }
              }
            }

            return copy;
          });

          // initialize fuse
          const fuse = new Fuse(normalizedItems, fuseOptions);

          // Get URL query param
          const params = new URLSearchParams(window.location.search);
          const searchTermFromURL = params.get(paramName) || "";

          // Live input
          searchInput.addEventListener("input", (e) => {
            const term = e.target.value.trim();
            performSearch(term);
          });

          // If search term exists in URL, trigger search
          if (searchTermFromURL) {
            searchInput.value = searchTermFromURL;
            performSearch(searchTermFromURL);
          }
        })();
      </script>
    `;

    return output;
  }
}

module.exports = StaticFuzzySearchPlugin;
