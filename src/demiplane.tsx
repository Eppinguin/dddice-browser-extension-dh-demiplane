/** @format */
import createLogger from './log';
import { getStorage, setStorage } from './storage';
import { IRoll, ThreeDDiceRollEvent, ThreeDDice, ITheme, ThreeDDiceAPI, IUser } from 'dddice-js';
import notify from './utils/notify';
import { Notify } from 'notiflix/build/notiflix-notify-aio';

Notify.init({
  useIcon: false,
  fontSize: '16px',
  timeout: 10000,
  clickToClose: true,
});

const log = createLogger('demiplane');
log.info('DDDICE Demiplane');

let dddice: ThreeDDice;
let canvasElement: HTMLCanvasElement;
let user: IUser;

function getRollName() {
  // Select all elements with the class 'dice-history-item-name--source'
  const sourceElements = document.querySelectorAll('.dice-history-item-name--source');
  // Select all elements with the class 'dice-history-item-name'
  const nameElements = document.querySelectorAll('.dice-history-item-name');

  // Get the last element from each selection
  const lastSourceElement = sourceElements[sourceElements.length - 1];
  const lastNameElement = nameElements[nameElements.length - 1];

  // Extract and log the text content of these elements
  if (lastSourceElement.textContent && lastSourceElement.textContent) {
    return `${lastSourceElement.textContent}: ${lastNameElement.textContent}`;
  }
  else {
    return "";
  }
}

// Function to handle the button press
async function handleRollButtonClick() {
  const parsedResults = new Set<string>();

  // Fetch the theme
  const [theme, hopeTheme, fearTheme] = await Promise.all([
    getStorage('theme'),
    getStorage('hopeTheme'),
    getStorage('fearTheme'),
  ]);

  const hopeThemeId = hopeTheme ? hopeTheme.id : null;
  const fearThemeId = fearTheme ? fearTheme.id : null;

  // Use hopeThemeId and fearThemeId in your logic
  // Function to parse dice values and log them
  function parseDiceValues() {
    const diceContainer = document.querySelector('.dice-history-roll-result-container');
    if (!diceContainer) {
      return;
    }

    const diceArray = [];
    const diceElements = diceContainer.querySelectorAll('.history-item-result__die');

    diceElements.forEach(diceElement => {
      const valueElement = diceElement.querySelector('.history-item-result__label');
      const value = parseInt(valueElement.textContent, 10);
      const label = diceElement.querySelector('img').alt;
      const typeClass = Array.from(diceElement.classList).find(cls =>
        cls.startsWith('history-item-result__die--'),
      );
      const type = (() => {
        if (label === 'Hope' || label === 'Fear') {
          return 'd12';
        } else if (label === 'Advantage' || label === 'Disadvantage') {
          return 'd6';
        } else {
          return typeClass ? typeClass.split('--')[1] : 'unknown';
        }
      })();

      diceArray.push({
        type: label === 'Disadvantage' ? 'mod' : type,
        value: label === 'Disadvantage' ? -value : value,
        theme: label === 'Hope' ? hopeThemeId : label === 'Fear' ? fearThemeId : theme.id,
        label: label,
      });
    });

    const modifierElement = diceContainer.querySelector('.dice-history-item-static-modifier');
    if (modifierElement) {
      const modifierValue = parseInt(modifierElement.textContent.replace('+', ''), 10);
      if (modifierValue !== 0) {
        diceArray.push({
          type: 'mod',
          theme: theme.id,
          value: modifierValue,
        });
      }
    }

    const resultString = JSON.stringify(diceArray);
    if (!parsedResults.has(resultString)) {
      sendRollRequest(diceArray);
      parsedResults.add(resultString);
    }

    observer.disconnect(); // Stop observing after parsing the values once
  }

  // Create a MutationObserver to watch for changes in the DOM
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length) {
        parseDiceValues();
        getRollName();
      }
    });
  });

  // Start observing the document body for child list changes
  observer.observe(document.body, { childList: true, subtree: true });
}

// Create a MutationObserver to watch for changes in the DOM
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node instanceof HTMLElement && node.querySelector('.dice-roll-button--roll')) {
        const rollButton = node.querySelector('.dice-roll-button--roll');
        if (rollButton) {
          rollButton.addEventListener('click', handleRollButtonClick);
        }
      }
    });
  });
});

// Start observing the document body for child list changes
observer.observe(document.body, { childList: true, subtree: true });

async function sendRollRequest(roll) {
  // Handle the response data as needed
  const [room] = await Promise.all([getStorage('room')]);

  if (!dddice?.api) {
    notify(
      `dddice extension hasn't been set up yet. Please open the the extension pop up via the extensions menu`,
    );
  } else if (!room?.slug) {
    notify(
      'No dddice room has been selected. Please open the dddice extension pop up and select a room to roll in',
    );
  } else {
    try {
      // await dddice.api.room.updateRolls(room.slug, { is_cleared: true });
      await updateUsername();
      let label = getRollName();
      await dddice.api.roll.create(roll, {label: label});
    } catch (e) {
      console.error(e);
      notify(`${e.response?.data?.data?.message ?? e}`);
    }
  }
}

async function updateUsername() {
  const [room] = await Promise.all([getStorage('room')]);
  if (!dddice?.api) {
    notify(
      `dddice extension hasn't been set up yet. Please open the the extension pop up via the extensions menu`,
    );
  } else if (!room?.slug) {
    notify(
      'No dddice room has been selected. Please open the dddice extension pop up and select a room to roll in',
    );
  } else {
    try {
      const characterNameElement = document.querySelector(
        '.MuiGrid-root.MuiGrid-item.text-block.character-name.css-1ipveys .text-block__text.MuiBox-root.css-1dyfylb',
      );
      const characterName = characterNameElement ? characterNameElement.textContent : null;
      if (!user) {
        user = (await dddice.api.user.get()).data;
      }
      const userParticipant = room.participants.find(
        ({ user: { uuid: participantUuid } }) => participantUuid === user.uuid,
      );
      if (characterName && userParticipant.username != characterName) {
        userParticipant.username = characterName;
        setStorage({ room });
        await dddice.api.room.updateParticipant(room.slug, userParticipant.id, {
          username: characterName,
        });
      }
    } catch (e) {
      console.error(e);
      notify(`${e.response?.data?.data?.message ?? e}`);
    }
  }
}

async function initializeSDK() {
  return Promise.all([
    getStorage('apiKey'),
    getStorage('room'),
    getStorage('theme'),
    getStorage('render mode'),
  ]).then(async ([apiKey, room, theme, renderMode]) => {
    if (apiKey) {
      log.debug('initializeSDK', renderMode);
      if (dddice) {
        // clear the board
        if (canvasElement) canvasElement.remove();
        // disconnect from echo
        if (dddice.api?.connection) dddice.api.connection.disconnect();
        // stop the animation loop
        dddice.stop();
      }
      if (renderMode === undefined || renderMode) {
        canvasElement = document.createElement('canvas');
        canvasElement.id = 'dddice-canvas';
        canvasElement.style.top = '0px';
        canvasElement.style.position = 'fixed';
        canvasElement.style.pointerEvents = 'none';
        canvasElement.style.zIndex = '100000';
        canvasElement.style.opacity = '100';
        canvasElement.style.height = '100vh';
        canvasElement.style.width = '100vw';
        document.body.appendChild(canvasElement);
        try {
          dddice = new ThreeDDice().initialize(canvasElement, apiKey, undefined, 'Demiplane');
          dddice.start();
          if (room) {
            dddice.connect(room.slug);
          }
        } catch (e) {
          console.error(e);
          notify(`${e.response?.data?.data?.message ?? e}`);
        }
        if (theme) {
          preloadTheme(theme);
        }
      } else {
        try {
          dddice = new ThreeDDice();
          dddice.api = new ThreeDDiceAPI(apiKey, 'Demiplane');
          if (room) {
            dddice.api.connect(room.slug);
          }
        } catch (e) {
          console.error(e);
          notify(`${e.response?.data?.data?.message ?? e}`);
        }
      }
    } else {
      log.debug('no api key');
    }
  });
}

function preloadTheme(theme: ITheme) {
  dddice.loadTheme(theme, true);
  dddice.loadThemeResources(theme.id, true);
}
initializeSDK();
