import { createStoryListItem, getStoryCatalog, setActiveStory } from './catalog.js';

const feed = document.getElementById('story-list-feed');
const target = document.body.dataset.listTarget === 'story' ? 'story' : 'talk';
const targetLabel = target === 'story' ? 'STORYへ進む' : 'TALKへ進む';
const targetFile = target === 'story' ? 'story.html' : 'talk.html';

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

renderList();
