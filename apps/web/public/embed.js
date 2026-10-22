/*
 * StageDesk inquiry form for your own website.
 *
 *   <script src="https://stagedesk.pro/embed.js" data-agency="your-agency" data-lang="nl" async></script>
 *
 * Inserts the form where the script tag is and keeps its height in step.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var agency = script.getAttribute("data-agency");
  if (!agency || !/^[a-z0-9-]+$/.test(agency)) return;
  var origin = new URL(script.src).origin;
  var lang = script.getAttribute("data-lang") === "en" ? "/en" : "";

  var frame = document.createElement("iframe");
  frame.src = origin + lang + "/embed/" + agency;
  frame.title = "Inquiry form";
  frame.loading = "lazy";
  frame.style.cssText = "width:100%;border:0;min-height:640px;display:block;color-scheme:normal";
  script.parentNode.insertBefore(frame, script);

  window.addEventListener("message", function (event) {
    // Only trust height messages from StageDesk and from this frame.
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    var data = event.data;
    if (data && data.type === "stagedesk:height" && typeof data.height === "number") {
      frame.style.height = Math.max(400, Math.min(data.height, 6000)) + "px";
    }
  });
})();
