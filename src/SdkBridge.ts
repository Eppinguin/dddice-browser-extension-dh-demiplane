/** @format */

import { ITheme } from 'dddice-js';

export default class SdkBridge {
  reloadDiceEngine() {
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'reloadDiceEngine' }));
    });
  }

  preloadTheme(theme: ITheme) {
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'preloadTheme', theme }));
    });
  }

  async detectPlatform() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (/dndbeyond.com/.test(tab.url)) {
      return 'D&DBeyond';
    } else if (/roll20.net/.test(tab.url)) {
      return 'Roll20';
    } else if (/www.dungeonmastersvault.com/.test(tab.url)) {
      return "Dungeon Master's Vault";
    } else if (/dddice.com/.test(tab.url)) {
      return 'dddice';
    } else if (/pathbuilder2e.com/.test(tab.url)) {
      return 'Pathbuilder 2e';
    }
  }
}
