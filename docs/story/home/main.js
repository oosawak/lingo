import { createStoryCard, getStoryCatalog } from '../catalog.js';

const feed = document.getElementById('story-home-feed');

function renderHomeFeed() {
  if (!feed) {
    return;
  }

  feed.innerHTML = '';

  for (const story of getStoryCatalog()) {
    feed.appendChild(createStoryCard(story));
  }
}

renderHomeFeed();
