import { createStoryListItem, getStoryCatalog, setActiveStory } from './catalog.js';

const feed = document.getElementById('story-list-feed');
const talkEngineButtons = [...document.querySelectorAll('[data-talk-engine]')];
const target = document.body.dataset.listTarget === 'story' ? 'story' : 'talk';
const targetLabel = target === 'story' ? 'STORYへ進む' : 'TALKへ進む';
const targetFile = target === 'story' ? 'story.html' : 'talk.html';
const ENGINE_STORAGE_KEY = 'lingo.story.talk.engine';

function loadEnginePreference() {
  try {
    const raw = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    return raw === 'worker' || raw === 'builtin' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

function saveEnginePreference(preference) {
  window.localStorage.setItem(ENGINE_STORAGE_KEY, preference);
}

function syncEngineButtons() {
  const preference = loadEnginePreference();

  for (const button of talkEngineButtons) {
    const isActive = button.dataset.talkEngine === preference;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
}

function renderList() {
  if (!feed) {
    return;
  }

  feed.innerHTML = '';

  for (const story of getStoryCatalog()) {
    feed.appendChild(createStoryListItem(story, {
      actionLabel: targetLabel,
      onPick: (pickedStory) => {
        setActiveStory(pickedStory);
        window.location.href = targetFile;
      },
    }));
  }
}

for (const button of talkEngineButtons) {
  button.addEventListener('click', () => {
    const preference = button.dataset.talkEngine || 'auto';
    saveEnginePreference(preference);
    syncEngineButtons();
  });
}

syncEngineButtons();
renderList();
