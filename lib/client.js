window.__ModuleLoader__.load({
	id: "dsh-her-eyes",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var React = require("react");

		// ---------- i18n dictionaries (inlined; locale service registers once) ----------
		var NS = "settings.her-eyes";
		var DICTS = {
			zh: {
				nav: "视觉模型 (VLM)",
				loading: "加载中…",
				loadFail: "加载配置失败：",
				unknown: "未知错误",
				intro: "配置视觉语言模型 (VLM)：所有修改自动保存、立即生效，无需“保存”按钮。AI 通过 analyze_image 工具调用这些 API 分析图片；主 API 连续失败超过重试次数后自动切换到备选 API。也可直接编辑本地配置文件。",
				primaryTitle: "主 VLM API",
				backupTitle: "备选 VLM API",
				retryTitle: "重试与回退",
				endpointLabel: "端点 URL（OpenAI 兼容；填 base，如 https://api.openai.com/v1，或直接填 …/chat/completions）",
				apiKeyLabel: "API Key（输入后自动保存；留空保持不变）",
				apiKeySet: "已设置（输入新值以替换）",
				modelLabel: "模型",
				modelPh: "如 gpt-4o / qwen-vl-max / glm-4v",
				fetchBtn: "获取可用模型",
				fetching: "获取中…",
				resetBtn: "重置为主 API",
				resetting: "重置中…",
				endpointHint: "提示：填好端点（和 Key）后点“获取可用模型”即可拉取模型列表；所有修改都会自动保存。",
				modelsAvail: "可用模型：",
				retryLabel: "重试次数（默认 5：单个 API 连续失败超过该值后回退/切换）",
				curUsing: "当前使用：",
				primaryAPI: "主 API",
				backupAPI: "备选 API",
				primaryFail: " · 主失败次数 ",
				backupFail: " · 备选失败次数 ",
				saving: " · 正在自动保存…",
				fetchOkPrefix: "可用模型 ",
				fetchOkSuffix: " 个",
				fetchFail: "获取模型列表失败：",
				resetOk: "已重置为优先使用主 API",
				resetFail: "重置失败"
			},
			en: {
				nav: "Vision Models (VLM)",
				loading: "Loading…",
				loadFail: "Failed to load config: ",
				unknown: "unknown error",
				intro: "Configure Vision-Language Models (VLM). All changes auto-save and take effect immediately — no Save button. The AI calls these APIs via the analyze_image tool to analyze images. If the primary API fails consecutively beyond the retry limit, it auto-switches to the backup. You can also edit the local config file directly.",
				primaryTitle: "Primary VLM API",
				backupTitle: "Backup VLM API",
				retryTitle: "Retry & Fallback",
				endpointLabel: "Endpoint URL (OpenAI-compatible; base like https://api.openai.com/v1, or full …/chat/completions)",
				apiKeyLabel: "API Key (auto-saves on input; leave blank to keep)",
				apiKeySet: "Set (enter new value to replace)",
				modelLabel: "Model",
				modelPh: "e.g. gpt-4o / qwen-vl-max / glm-4v",
				fetchBtn: "Fetch available models",
				fetching: "Fetching…",
				resetBtn: "Reset to primary",
				resetting: "Resetting…",
				endpointHint: "Tip: enter the endpoint (and Key) then click “Fetch available models” to list models; all edits auto-save.",
				modelsAvail: "Available models: ",
				retryLabel: "Retry count (default 5: switch/fallback after this many consecutive failures of one API)",
				curUsing: "Currently using: ",
				primaryAPI: "Primary API",
				backupAPI: "Backup API",
				primaryFail: " · primary failures ",
				backupFail: " · backup failures ",
				saving: " · auto-saving…",
				fetchOkPrefix: "Available models: ",
				fetchOkSuffix: "",
				fetchFail: "Failed to fetch models: ",
				resetOk: "Reset to prefer primary API",
				resetFail: "Reset failed"
			}
		};
		var tBound = null;

		// ---------- RPC to the host half (web routes) ----------
		function call(method, payload) {
			var url = "/vlm/" + method;
			var init = { headers: { Accept: "application/json" } };
			if (!(method === "config" && payload === undefined)) {
				init.method = "POST";
				init.headers["Content-Type"] = "application/json";
				init.body = JSON.stringify(payload || {});
			}
			return fetch(url, init).then(function (response) {
				return response.json().catch(function () { return null; });
			});
		}

		// ---------- styling ----------
		var CSS = [
			".vlm-page { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; font-size: 13px; }",
			".vlm-card { border: 1px solid var(--dsh-border, #555); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; background: var(--dsh-bg-2, rgba(128,128,128,0.07)); }",
			".vlm-card h3 { margin: 0 0 2px; font-size: 14px; }",
			".vlm-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }",
			".vlm-grow { flex: 1; }",
			".vlm-label { opacity: 0.8; }",
			".vlm-input { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--dsh-border, #555); background: var(--dsh-bg, #1e1e1e); color: var(--dsh-fg, #eee); font-size: 13px; box-sizing: border-box; width: 100%; }",
			".vlm-row { display: flex; gap: 8px; align-items: flex-end; }",
			".vlm-row .vlm-field { flex: 1; }",
			".vlm-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--dsh-border, #555); background: var(--dsh-bg-2, #333); color: var(--dsh-fg, #eee); cursor: pointer; font-size: 13px; white-space: nowrap; }",
			".vlm-btn:disabled { opacity: 0.55; cursor: default; }",
			".vlm-models { font-size: 11px; opacity: 0.75; margin: 0; word-break: break-all; }",
			".vlm-status { font-size: 11px; opacity: 0.75; margin: 0; }",
			".vlm-msg { font-size: 12px; margin: 0; }",
			".vlm-err { color: #f85149; }",
			".vlm-ok { color: #3fb950; }",
			".vlm-desc { font-size: 12px; opacity: 0.8; margin: 0; line-height: 1.6; }",
			".vlm-actions { align-items: center; }"
		].join("\n");

		function ensureStyles() {
			if (typeof document === "undefined" || document.getElementById("dsh-her-eyes-css") !== null) return;
			var tag = document.createElement("style");
			tag.id = "dsh-her-eyes-css";
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// ---------- auto-save helpers (debounced, merging pending patches) ----------
		function debounce(fn, ms) {
			var timer = null;
			return function () {
				var self = this;
				var args = arguments;
				if (timer !== null) clearTimeout(timer);
				timer = setTimeout(function () {
					timer = null;
					fn.apply(self, args);
				}, ms);
			};
		}

		function mergePatch(a, b) {
			if (a === null || a === undefined) return b;
			if (b === null || b === undefined) return a;
			if (typeof a !== "object" || Array.isArray(a) || typeof b !== "object" || Array.isArray(b)) return b;
			var out = Object.assign({}, a);
			for (var key of Object.keys(b)) out[key] = key in out ? mergePatch(out[key], b[key]) : b[key];
			return out;
		}

		var pendingPatch = null;
		var scheduleSave = debounce(function () {
			if (pendingPatch === null) return;
			var patch = pendingPatch;
			pendingPatch = null;
			call("config", patch).catch(function () {});
		}, 600);
		function queueSave(patch) {
			pendingPatch = mergePatch(pendingPatch, patch);
			scheduleSave();
		}

		var et = function (e) { return (e && e.message ? e.message : String(e)); };

		// ---------- shared UI atoms ----------
		function Field(props) {
			return React.createElement("label", { className: "vlm-field" }, [
				React.createElement("span", { className: "vlm-label" }, props.label),
				React.createElement("input", {
					className: "vlm-input",
					type: props.password ? "password" : props.number ? "number" : "text",
					value: props.value,
					placeholder: props.placeholder || "",
					list: props.list || undefined,
					min: props.min,
					onChange: props.onChange
				})
			]);
		}

		function VlmSettingsPage(props) {
			var t = (props && props.t) || tBound || (function (k) { return k; });
			var snap = React.useState(null);
			var draft = React.useState(null);
			var keyDraft = React.useState({ primary: "", backup: "" });
			var busy = React.useState("");
			var msg = React.useState("");
			var errState = React.useState(false);
			var saveState = React.useState("");
			var models = React.useState({});

			function setMsg(text, isError) {
				msg[1](text);
				errState[1](!!isError);
			}

			React.useEffect(function () {
				call("config").then(function (s) {
					if (s && s.config) {
						snap[1](s);
						draft[1](s.config);
					} else {
						setMsg(t("loadFail") + (s && s.error ? s.error : t("unknown")), true);
					}
				}).catch(function (e) { setMsg(t("loadFail") + et(e), true); });
			}, []);

			if (!draft[0]) {
				return React.createElement("div", { className: "vlm-page" }, [
					React.createElement("p", { className: "vlm-desc" }, t("loading")),
					msg[0] ? React.createElement("p", { className: "vlm-msg vlm-err" }, msg[0]) : null
				]);
			}

			function patchApi(which, fieldName, value) {
				draft[1](function (d) {
					var next = JSON.parse(JSON.stringify(d));
					next.api[which][fieldName] = value;
					return next;
				});
				if (fieldName === "apiKey" && String(value || "").length === 0) return;
				saveState[1]("saving");
				var patch = { api: {} };
				patch.api[which] = {};
				patch.api[which][fieldName] = value;
				queueSave(patch);
				Promise.resolve().then(function () { saveState[1]("recent"); });
			}

			function patchRetry(value) {
				draft[1](function (d) { return Object.assign({}, d, { retryCount: value }); });
				saveState[1]("saving");
				queueSave({ retryCount: Number(value) || 5 });
				Promise.resolve().then(function () { saveState[1]("recent"); });
			}

			function saveKey(which, value) {
				keyDraft[1](function (k) { return Object.assign({}, k, { [which]: value }); });
				if (String(value || "").length === 0) return;
				saveState[1]("saving");
				queueSave({ api: {} });
				var patch = { api: {} };
				patch.api[which] = { apiKey: value };
				queueSave(patch);
				Promise.resolve().then(function () { saveState[1]("recent"); });
			}

			function fetchModels(which) {
				busy[1]("mdl-" + which);
				setMsg("", false);
				var endpoint = draft[0].api[which].endpoint || undefined;
				var apiKey = keyDraft[0][which] || undefined;
				call("models", { api: which, endpoint: endpoint, apiKey: apiKey }).then(function (r) {
					if (r && r.ok) {
						models[1](function (m) { return Object.assign({}, m, { [which]: r.models || [] }); });
						setMsg(t("fetchOkPrefix") + (r.models || []).length + t("fetchOkSuffix"), false);
					} else {
						setMsg(t("fetchFail") + (r && r.error ? r.error : t("unknown")), true);
					}
				}).catch(function (e) { setMsg(t("fetchFail") + et(e), true); }).finally(function () { busy[1](""); });
			}

			function reset() {
				busy[1]("rst");
				setMsg("", false);
				call("reset").then(function (r) {
					setMsg(r && r.ok ? t("resetOk") : t("resetFail"), !(r && r.ok));
					return call("config");
				}).then(function (s) {
					if (s && s.config) snap[1](s);
				}).catch(function (e) { setMsg(t("resetFail") + ": " + et(e), true); }).finally(function () { busy[1](""); });
			}

			function apiCard(which, title) {
				var a = draft[0].api[which];
				var modelList = models[0][which] || [];
				return React.createElement("div", { className: "vlm-card" }, [
					React.createElement("h3", null, title),
					React.createElement(Field, {
						label: t("endpointLabel"),
						value: a.endpoint || "",
						placeholder: "https://api.example.com/v1",
						onChange: function (e) { patchApi(which, "endpoint", e.target.value); }
					}),
					React.createElement(Field, {
						label: t("apiKeyLabel"),
						password: true,
						value: keyDraft[0][which],
						placeholder: a.apiKeySet ? t("apiKeySet") : "sk-...",
						onChange: function (e) { saveKey(which, e.target.value); }
					}),
					React.createElement("div", { className: "vlm-row" }, [
						React.createElement("div", { className: "vlm-field vlm-grow" }, [
							React.createElement("span", { className: "vlm-label" }, t("modelLabel")),
							React.createElement("input", {
								className: "vlm-input",
								type: "text",
								value: a.model || "",
								placeholder: t("modelPh"),
								list: "vlm-models-" + which,
								onChange: function (e) { patchApi(which, "model", e.target.value); }
							}),
							React.createElement("datalist", { id: "vlm-models-" + which },
								modelList.map(function (m) { return React.createElement("option", { key: m, value: m }); }))
						]),
						React.createElement("button", {
							className: "vlm-btn",
							disabled: busy[0] !== "",
							onClick: function () { fetchModels(which); }
						}, busy[0] === "mdl-" + which ? t("fetching") : t("fetchBtn"))
					]),
					!a.endpoint ? React.createElement("p", { className: "vlm-models" }, t("endpointHint")) : null,
					modelList.length > 0 ? React.createElement("p", { className: "vlm-models" }, t("modelsAvail") + modelList.join(", ")) : null
				]);
			}

			return React.createElement("div", { className: "vlm-page" }, [
				React.createElement("p", { className: "vlm-desc" }, t("intro")),
				apiCard("primary", t("primaryTitle")),
				apiCard("backup", t("backupTitle")),
				React.createElement("div", { className: "vlm-card" }, [
					React.createElement("h3", null, t("retryTitle")),
					React.createElement(Field, {
						label: t("retryLabel"),
						number: true,
						min: 1,
						value: String(draft[0].retryCount || 5),
						onChange: function (e) { patchRetry(e.target.value); }
					}),
					React.createElement("div", { className: "vlm-row vlm-actions" }, [
						React.createElement("button", { className: "vlm-btn", disabled: busy[0] !== "", onClick: reset },
							busy[0] === "rst" ? t("resetting") : t("resetBtn"))
					])
				]),
				snap[0] ? React.createElement("p", { className: "vlm-status" },
					t("curUsing") + (snap[0].activeApi === "backup" ? t("backupAPI") : t("primaryAPI")) +
					t("primaryFail") + (snap[0].primaryFailures || 0) +
					t("backupFail") + (snap[0].backupFailures || 0) +
					(saveState[0] === "saving" ? t("saving") : "")) : null,
				msg[0] ? React.createElement("p", { className: "vlm-msg " + (errState[0] ? "vlm-err" : "vlm-ok") }, msg[0]) : null
			]);
		}

		// ---------- plugin entry ----------
		function apply(ctx) {
			ensureStyles();
			var locale = ctx.get ? ctx.get("locale") : null;
			if (locale) {
				tBound = locale.bind(NS);
				var effect0 = typeof ctx.effect === "function" ? ctx.effect : function (fn) { var d = fn(); return d; };
				effect0(function () { return locale.register(NS, DICTS); });
			}
			var slots = ctx.get ? ctx.get("slots") : ctx.slots;
			if (!slots) return;
			var effect = typeof ctx.effect === "function" ? ctx.effect : function (fn) { var d = fn(); return d; };

			effect(function () {
				return slots.inject("settings.section", function () {
					return slots.register(
						{ name: "settings.section", id: "vlm-vision", order: 40, locale: NS, label: function () { return tBound ? tBound("nav") : "视觉模型 (VLM)"; } },
						function (props) { return React.createElement(VlmSettingsPage, { close: props && props.close, t: (props && props.t) || tBound }); }
					);
				});
			});
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale"];
		return module.exports;
	}
});
