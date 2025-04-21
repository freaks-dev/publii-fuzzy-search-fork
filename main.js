class StaticFuzzySearchPlugin {
	constructor (API, name, config) {
		this.API = API;
		this.name = name;
		this.config = config;
	}

	addInsertions () {
		this.API.addInsertion('customSearchInput', this.addSearchInput, 1, this);
		this.API.addInsertion('customSearchContent', this.addSearchContent, 1, this);
	}

	addSearchInput (rendererInstance, context) {
		let searchUrl = '';
		
		if (rendererInstance.globalContext && rendererInstance.globalContext.website) {
			searchUrl = rendererInstance.globalContext.website.searchUrl;
		}

		let output = `<form action="${searchUrl}" class="search__form">
                     <input
                        class="search__input"
                        type="search"
                        name="${this.config.searchParam}"
                        placeholder="${this.config.searchPlaceholder}" 
                        aria-label="${this.config.searchPlaceholder}"
						required/>
                  </form>`;

		return output;
	}

	addSearchContent(rendererInstance, context) {
		let output = `
			<form 
				action="javascript:void(0);" 
				class="search-page-form" 
				onsubmit="return false;">
				<input
					type="search"
					id="live-search-input"
					placeholder="${this.config.searchPlaceholder}"
					class="search-page-input"
					required />
			</form>
	
			<div id="search-results"></div>
	
			<script src="${rendererInstance.siteConfig.domain}/media/plugins/staticFuzzySearch/fuse.js"></script>
			<script>
				(async function () {
					const searchInput = document.getElementById("live-search-input");
					const resultsContainer = document.getElementById("search-results");
	
					// Get URL query param
					const params = new URLSearchParams(window.location.search);
					const searchTermFromURL = params.get("${this.config.searchParam}") || "";
	
					// Fetch data
					const response = await fetch("${this.config.jsonFeedUrl}");
					const jsonData = await response.json();
					const items = jsonData.items;
	
					const fuse = new Fuse(items, {
						keys: ["title", "summary", "tags"],
						isCaseSensitive: ${this.config.isCaseSensitive},
						includeScore: ${this.config.includeScore},
						includeMatches: ${this.config.includeMatches},
						findAllMatches: ${this.config.findAllMatches},
						minMatchCharLength: ${this.config.minMatchCharLength},
						shouldSort: ${this.config.shouldSort},
						ignoreLocation: ${this.config.ignoreLocation},
						ignoreDiacritics: ${this.config.ignoreDiacritics},
						useExtendedSearch: ${this.config.useExtendedSearch},
						threshold: ${this.config.threshold},
						location: ${this.config.location},
						fieldNormWeight: ${this.config.fieldNormWeight},
						ignoreFieldNorm: ${this.config.ignoreFieldNorm},
						distance: ${this.config.distance}
					});

					function highlightMatches(text, matches, key) {
						if (!matches) return text;

						let match = matches.find(m => m.key === key);
						if (!match) return text;

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
	
						if (results.length === 0) {
							resultsContainer.innerHTML = "<p>No Results Found</p>";
							return;
						}
	
						results.forEach(result => {
							const item = result.item;
							const title = highlightMatches(item.title || "", result.matches, "title");
							const summary = highlightMatches(item.summary || "", result.matches, "summary");

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
						if (term.length < 2) {
							resultsContainer.innerHTML = "";
							return;
						}
						history.replaceState(null, "", "?${this.config.searchParam}=" + encodeURIComponent(term));

						const results = fuse.search(term);
						renderResults(results);
					}
	
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
