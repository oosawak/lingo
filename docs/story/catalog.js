export const STORY_CATALOG = [
  {
    id: 'lost-city',
    title: '失われた街',
    description: '会話で状況が進む、基本の物語。',
    thumbClass: 'feed-thumb-a',
    storyTheme: '失われた街',
    storyDescription: '失われた街を舞台に、会話で状況が進む物語を進行する。',
  },
  {
    id: 'guild-night',
    title: 'ギルド職員は元Sランク冒険者',
    description: '依頼と報告が交差する、硬派なギルド物語。',
    thumbClass: 'feed-thumb-b',
    storyTheme: 'ギルド職員は元Sランク冒険者',
    storyDescription: 'ギルドの受付と依頼整理を中心に進む、少し渋めの冒険者譚。',
  },
  {
    id: 'shrine-route',
    title: '王都外れの祈祷所',
    description: '魔法と信仰が絡む、静かなRPG風の物語。',
    thumbClass: 'feed-thumb-c',
    storyTheme: '王都外れの祈祷所',
    storyDescription: '王都の外れにある祈祷所を舞台に、静かに進むRPG風の物語。',
  },
];

export function getActiveStoryId() {
  try {
    return window.localStorage.getItem('lingo.story.active') || '';
  } catch {
    return '';
  }
}

export function createStoryCard(story, options = {}) {
  const {
    actionLabel = '',
    actions = null,
    onPick = null,
    activeStoryId = getActiveStoryId(),
  } = options;

  const article = document.createElement('article');
  article.className = 'feed-card';

  if (story.id && story.id === activeStoryId) {
    article.dataset.active = 'true';
  }

  const thumb = document.createElement('div');
  thumb.className = `feed-thumb ${story.thumbClass}`;

  const body = document.createElement('div');
  body.className = 'feed-body';

  const title = document.createElement('h3');
  title.textContent = story.title;

  const description = document.createElement('p');
  description.textContent = story.description;

  body.append(title, description);

  if (Array.isArray(actions) && actions.length > 0) {
    const actionRow = document.createElement('div');
    actionRow.className = 'story-card-actions';

    for (const action of actions) {
      if (!action || typeof action.label !== 'string' || typeof action.onClick !== 'function') {
        continue;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.variant === 'secondary' ? 'button button-secondary' : 'button button-primary';
      button.textContent = action.label;
      button.addEventListener('click', () => action.onClick(story));
      actionRow.appendChild(button);
    }

    if (actionRow.childElementCount > 0) {
      body.appendChild(actionRow);
    }
  } else if (actionLabel && typeof onPick === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-primary';
    button.style.marginTop = '14px';
    button.textContent = actionLabel;
    button.addEventListener('click', () => onPick(story));
    body.appendChild(button);
  }

  article.append(thumb, body);
  return article;
}

export function createStoryListItem(story, options = {}) {
  const {
    actionLabel = '',
    onPick = null,
    activeStoryId = getActiveStoryId(),
  } = options;

  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'story-list-item';

  if (story.id && story.id === activeStoryId) {
    item.dataset.active = 'true';
  }

  const thumb = document.createElement('div');
  thumb.className = `story-list-thumb ${story.thumbClass}`;

  const body = document.createElement('div');
  body.className = 'story-list-body';

  const title = document.createElement('h3');
  title.textContent = story.title;

  const description = document.createElement('p');
  description.textContent = story.description;

  body.append(title, description);

  if (actionLabel && typeof onPick === 'function') {
    const action = document.createElement('span');
    action.className = 'story-list-action';
    action.textContent = actionLabel;
    body.appendChild(action);
  }

  item.addEventListener('click', () => {
    if (typeof onPick === 'function') {
      onPick(story);
    }
  });

  item.append(thumb, body);
  return item;
}

export function getStoryCatalog() {
  try {
    const raw = window.localStorage.getItem('lingo.story.state');
    const state = raw ? JSON.parse(raw) : null;
    const title = (state?.storySettings?.summary?.title || state?.plot?.title || state?.theme || '').trim();
    const description = (state?.storySettings?.summary?.description || state?.plot?.premise || state?.description || '').trim();

    return STORY_CATALOG.map((item, index) => {
      if (index !== 0 || !title) {
        return item;
      }

      return {
        ...item,
        title,
        description: description || item.description,
        storyTheme: title,
        storyDescription: description || item.storyDescription,
      };
    });
  } catch {
    return STORY_CATALOG;
  }
}

export function setActiveStory(story) {
  const nextState = {
    chapter: 1,
    scene: 1,
    pov: 'You',
    theme: story.storyTheme,
    description: story.storyDescription,
    lines: [],
    entries: [],
    activeTab: 'basic',
    plot: {
      title: story.storyTheme,
      premise: story.storyDescription,
      rules: [
        '会話1回につき、物語は1段階だけ進む',
        '章とシーンは保存され、再読込後も復元される',
        '応答はプロットに沿って簡潔に返す',
      ],
      cast: ['You', 'Narrator'],
      currentBeat: '導入',
      nextBeat: '未定',
    },
    storySettings: {
      summary: {
        title: story.storyTheme,
        description: story.storyDescription,
        tags: '',
        copy: '',
      },
    },
  };

  window.localStorage.setItem('lingo.story.state', JSON.stringify(nextState));
  window.localStorage.setItem('lingo.story.active', story.id);
}
