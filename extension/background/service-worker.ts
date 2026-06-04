chrome.runtime.onInstalled.addListener(() => {
  console.log("Bookmarks extension installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_CURRENT_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      sendResponse({
        url: tab?.url || "",
        title: tab?.title || "",
      });
    });
    return true;
  }
});
