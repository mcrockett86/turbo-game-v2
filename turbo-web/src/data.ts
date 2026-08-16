/**
 * Game content data — DOGS, ZONES, ITEMS, THREATS, COMPANIONS
 * 
 * Loaded once at boot. Immutable after initialization.
 */

import type { Dog, Zone, Item, Threat, Companion } from './types';

// ===== DOG DATA =====

export const DOGS: Record<string, Dog> = {
  turbo: {
    id: 'turbo',
    name: 'Turbo',
    breed: 'Alaskan Husky',
    trait: 'speed' as const,
    traitDesc: 'Moves faster, escapes threats quicker',
    colors: { fur: ['#ffffff', '#3a3a3a', '#8B4513'], accent: '#4a9eff' },
    personality: ['adventurous', 'loyal', 'curious'] as const,
    lines: {
      intro: "The gate was open. I don't remember opening it... but the world is OUTSIDE.",
      happy: "Woof! Best day ever!",
      scared: "What was that?! ...I'm not scared. I'm just cautiously observant.",
      hint: "I smell something familiar... like home?",
      combat: "Leave it to me! *growls bravely*",
      foundFriend: "A new friend?! *wags tail furiously*"
    }
  },
  watson: {
    id: 'watson',
    name: 'Watson',
    breed: 'German Shepherd',
    trait: 'brave' as const,
    traitDesc: 'Combat is easier, intimidation works',
    colors: { fur: ['#2a1a0a', '#4a2a0a', '#1a0a00'], accent: '#d4a020' },
    personality: ['brave', 'protective', 'disciplined'] as const,
    lines: {
      intro: "I don't know where I am, but if anything threatens anyone, it'll answer to me.",
      happy: "*stays alert but tail gives a small wag*",
      scared: "*ears flatten, then stands taller* I'm fine. Really.",
      hint: "That direction... I should investigate.",
      combat: "Not on my watch. *steps forward*",
      foundFriend: "A fellow warrior? ...Do you know the way home?"
    }
  },
  nova: {
    id: 'nova',
    name: 'Nova',
    breed: 'Golden Retriever',
    trait: 'happiness' as const,
    traitDesc: 'Companions boost more, morale decays slower',
    colors: { fur: ['#DAA520', '#FFD700', '#B8860B'], accent: '#ff9f43' },
    personality: ['friendly', 'optimistic', 'generous'] as const,
    lines: {
      intro: "Oh wow! Everything is so big and new! I hope I make lots of friends!",
      happy: "This is the BEST thing that's ever happened! *does happy pirouette*",
      scared: "*whimpers* ...But I'll be brave for everyone!",
      hint: "Ooh! A clue! Maybe we're getting closer to home!",
      combat: "*barks confidently* They won't hurt my friends!",
      foundFriend: "A new friend?! *immediately starts playing*"
    }
  },
  walter: {
    id: 'walter',
    name: 'Walter',
    breed: 'English Bulldog',
    trait: 'sniff' as const,
    traitDesc: 'Finds food and hints faster',
    colors: { fur: ['#D2B48C', '#C4A882', '#8B7355'], accent: '#e07040' },
    personality: ['food-motivated', 'calm', 'stubborn'] as const,
    lines: {
      intro: "I was napping... now I'm somewhere else. Hope there's food here.",
      happy: "*pants happily* Nothing beats a good day and a good snack.",
      scared: "*huffs* I'm not afraid of... *hears noise* ...of anything.",
      hint: "*sniff sniff* ...Yeah, that smells like home. Definitely home.",
      combat: "*stands his ground, looking like he's about to sneeze*",
      foundFriend: "*sniffs new dog* ...Do you have snacks? ...Wait, you're a friend?"
    }
  },
  beaux: {
    id: 'beaux',
    name: 'Beaux',
    breed: 'Chihuahua',
    trait: 'compact' as const,
    traitDesc: 'Carries extra item in tiny bandana',
    colors: { fur: ['#F5DEB3', '#DEB887', '#D2B48C'], accent: '#ff6b81' },
    personality: ['tough', 'tiny', 'surprisingly brave'] as const,
    lines: {
      intro: "I may be small, but I'm NOT insignificant. And I have a bandana. Look.",
      happy: "*tiny happy yips* I am the best dog. Everyone knows this.",
      scared: "*makes himself look bigger* I'm not scared! I'm just... very alert!",
      hint: "*ears perk up* I can smell it from here. Well, maybe two blocks away.",
      combat: "*barks at volume 11* Who's the boss now?! *is 8 inches tall*",
      foundFriend: "*sniffs* You're big. I'm... I'm not intimidated at all. *is very intimidated*"
    }
  }
};

// ===== ZONE DATA =====

export const ZONES: Record<string, Zone> = {
  suburban_streets: {
    id: 'suburban_streets',
    name: '🏘️ Suburban Streets',
    desc: 'Wide sidewalks, unfamiliar houses. The world is so big.',
    type: 'fp' as const,
    rooms: [
      { id: 'start', name: 'Front Yard', w: 200, h: 150, d: 200, color: '#4a7a3a', exits: ['street_north', 'street_east'] },
      { id: 'street_north', name: 'North Street', w: 300, h: 120, d: 400, color: '#6a6a6a', exits: ['start', 'intersection'], features: [{type:'traffic', x:150, y:60, w:80, h:20, label:'🚗 Traffic'}] },
      { id: 'street_east', name: 'East Walk', w: 250, h: 100, d: 350, color: '#5a8a5a', exits: ['start', 'dog_park_gate'], features: [{type:'hint', x:100, y:50, w:30, h:30, label:'🦴 Bone', item:'bone'}] },
      { id: 'intersection', name: 'Street Intersection', w: 200, h: 150, d: 200, color: '#7a7a7a', exits: ['street_north', 'street_south', 'alley'], features: [{type:'choice', x:100, y:75, w:60, h:40, label:'Choose path'}] },
      { id: 'street_south', name: 'South Avenue', w: 350, h: 120, d: 300, color: '#6a6a6a', exits: ['intersection', 'apt_gate'], features: [{type:'door', x:175, y:60, w:40, h:50, label:'🚪 Door', locked:true}] },
      { id: 'alley', name: 'Back Alley', w: 180, h: 100, d: 300, color: '#3a3a4a', exits: ['intersection', 'shelter_entrance'], features: [{type:'cat', x:90, y:50, w:40, h:30, label:'🐱 Mean Cat'}] },
      { id: 'side_street', name: 'Side Street', w: 200, h: 100, d: 250, color: '#5a5a6a', exits: ['street_north', 'backyard'], features: [{type:'hint', x:100, y:50, w:30, h:30, label:'🐾 Scent Mark'}] },
      { id: 'backyard', name: 'Backyard', w: 150, h: 100, d: 200, color: '#4a6a3a', exits: ['side_street'], features: [{type:'food', x:75, y:50, w:40, h:30, label:'🍖 Treat'}] },
      { id: 'dog_park_gate', name: 'Dog Park Gate', w: 100, h: 80, d: 100, color: '#5a9a5a', exits: ['street_east'], isEntrance: true, entranceZone: 'dog_park' },
      { id: 'shelter_entrance', name: 'Shelter Door', w: 120, h: 100, d: 120, color: '#4a4a6a', exits: ['alley'], isEntrance: true, entranceZone: 'shelter' },
      { id: 'apt_gate', name: 'Apartment Gate', w: 100, h: 80, d: 100, color: '#7a6a5a', exits: ['street_south'], isEntrance: true, entranceZone: 'apartment' }
    ],
    music: 'suburban',
    hint: 'You see a squirrel. It reminds you of... something. A yard? With squirrels?'
  },

  dog_park: {
    id: 'dog_park',
    name: '🌳 Dog Park',
    desc: 'A bright, open space. Other dogs are everywhere!',
    type: 'tp' as const,
    music: 'dog_park',
    skyColor: '#87CEEB',
    groundColor: '#4a7c3f',
    dogColor: '#d4a574',
    accentColor: '#ff6b35',
    obstacles: [
      { type: 'fence', x: -8, z: -6, width: 6, height: 1.2, color: '#8B4513' },
      { type: 'tree', x: -4, z: 3, height: 3, trunkColor: '#5a3a1a', leafColor: '#2d5a1e' },
      { type: 'bench', x: 3, z: 5, width: 2, color: '#8B6914' }
    ],
    npcs: [
      { id: 'golden_retriever', name: 'Buddy', color: '#DAA520', accentColor: '#FFD700', x: 2, z: -3, dialogue: ['Woof! Welcome to the park!', 'Home is where the fence is.', 'Follow the scent posts — they lead somewhere!'] }
    ],
    features: [
      { type: 'water_bowl', x: 6, z: 3, id: 'water_bowl', label: '💧 Water Bowl' },
      { type: 'fire_hydrant', x: -5, z: -2, id: 'fire_hydrant', label: '🚒 Fire Hydrant' },
      { type: 'scent_post', x: 0, z: 7, id: 'scent_post', label: '🐾 Scent Post' }
    ],
    returnZone: 'suburban_streets',
    hint: 'A big dog says "Home is where the fence is." Fences are everywhere... but which fence?'
  },

  apartment: {
    id: 'apartment',
    name: '🏠 Random Apartment',
    desc: 'You found the door open. Inside: smells, sounds, and a TV that barks back.',
    type: 'fp' as const,
    rooms: [
      { id: 'apt_entrance', name: 'Entryway', w: 120, h: 80, d: 150, color: '#8a7a6a', exits: ['apt_living', 'apt_kitchen'], isEntrance: true },
      { id: 'apt_living', name: 'Living Room', w: 200, h: 100, d: 180, color: '#7a6a5a', exits: ['apt_entrance', 'apt_bedroom'], features: [{type:'tv', x:100, y:50, w:60, h:40, label:'📺 TV (barks back)'}] },
      { id: 'apt_kitchen', name: 'Kitchen', w: 150, h: 90, d: 120, color: '#9a8a7a', exits: ['apt_entrance', 'apt_bathroom'], features: [{type:'food', x:75, y:45, w:40, h:30, label:'🍖 Food'}] },
      { id: 'apt_bedroom', name: 'Bedroom', w: 160, h: 90, d: 140, color: '#6a5a7a', exits: ['apt_living'], features: [{type:'hint', x:80, y:45, w:50, h:30, label:'🧸 Toy'}] },
      { id: 'apt_bathroom', name: 'Bathroom', w: 100, h: 80, d: 100, color: '#8a8a9a', exits: ['apt_kitchen'], features: [{type:'water_bowl', x:50, y:40, w:30, h:30, label:'💧 Water Bowl'}] },
      { id: 'apt_balcony', name: 'Balcony', w: 120, h: 70, d: 80, color: '#5a7a5a', exits: ['apt_living'], features: [{type:'hint', x:60, y:35, w:40, h:30, label:'🌳 View'}] }
    ],
    music: 'apartment',
    hint: 'Under the bed: a red ball. You remember throwing this. Someone threw this. For YOU.',
    returnZone: 'suburban_streets'
  },

  shelter: {
    id: 'shelter',
    name: '🏥 Animal Shelter',
    desc: 'Cages, sounds, and hope. Maybe some dogs here know the way home.',
    type: 'fp' as const,
    rooms: [
      { id: 'shelter_lobby', name: 'Lobby', w: 200, h: 100, d: 150, color: '#8a8a9a', exits: ['shelter_kennels', 'shelter_office', 'shelter_garden'] },
      { id: 'shelter_exit', name: 'Exit Door', w: 80, h: 60, d: 80, color: '#6a6a7a', exits: ['shelter_lobby'] },
      { id: 'shelter_kennels', name: 'Kennels', w: 300, h: 120, d: 200, color: '#7a7a8a', exits: ['shelter_lobby'], features: [{type:'dog_friend', x:150, y:60, w:50, h:40, label:'🐕 New Friend'}] },
      { id: 'shelter_office', name: 'Office', w: 120, h: 80, d: 100, color: '#6a6a7a', exits: ['shelter_lobby'], features: [{type:'hint', x:60, y:40, w:40, h:30, label:'📋 Poster'}] },
      { id: 'shelter_garden', name: 'Garden', w: 150, h: 100, d: 120, color: '#4a7a3a', exits: ['shelter_lobby'], features: [{type:'food', x:75, y:50, w:40, h:30, label:'🍖 Treat'}] }
    ],
    music: 'shelter',
    hint: 'A poster shows a lost dog. It looks... familiar.',
    returnZone: 'suburban_streets'
  },

  neighborhood: {
    id: 'neighborhood',
    name: '🏡 The Neighborhood',
    desc: 'The streets feel familiar. You\'re close. You can feel it.',
    type: 'fp' as const,
    rooms: [
      { id: 'neighborhood_entrance', name: 'Side Gate', w: 80, h: 60, d: 80, color: '#5a5a5a', exits: ['neighborhood_start'], isEntrance: true },
      { id: 'neighborhood_start', name: 'Street Corner', w: 250, h: 120, d: 200, color: '#5a8a5a', exits: ['neighborhood_main'] },
      { id: 'neighborhood_main', name: 'Main Street', w: 350, h: 140, d: 300, color: '#6a6a6a', exits: ['neighborhood_start', 'neighborhood_home'], features: [{type:'person', x:175, y:70, w:40, h:60, label:'👤 "Have you seen a dog like him?"'}] },
      { id: 'neighborhood_park', name: 'Local Park', w: 200, h: 100, d: 180, color: '#4a7a3a', exits: ['neighborhood_start'], features: [{type:'hint', x:100, y:50, w:60, h:30, label:'🌳 Old Tree'}] },
      { id: 'neighborhood_home', name: 'The House', w: 180, h: 100, d: 150, color: '#8a7a5a', exits: ['neighborhood_main'], isHome: true, features: [{type:'home', x:90, y:50, w:60, h:60, label:'🏠 Home'}] }
    ],
    music: 'home',
    hint: 'The gate. It\'s the same gate. This is it.',
    returnZone: 'shelter'
  },

  home: {
    id: 'home',
    name: '🏡 Home',
    desc: 'You made it! The golden gate stands before you. This is where you belong.',
    type: 'fp' as const,
    rooms: [
      { id: 'home_gate', name: 'Golden Gate', w: 100, h: 80, d: 80, color: '#d4a017', exits: ['home_yard'], isEntrance: true },
      { id: 'home_yard', name: 'Backyard', w: 250, h: 150, d: 200, color: '#4a8a3a', exits: ['home_gate', 'home_door'], features: [{type:'celebration', x:125, y:75, w:80, h:60, label:'🎉 Welcome Home!'}] },
      { id: 'home_door', name: 'Front Door', w: 80, h: 100, d: 60, color: '#8a6a3a', exits: ['home_yard'], isHome: true, features: [{type:'home', x:40, y:50, w:60, h:60, label:'🏠 Home'}] }
    ],
    music: 'home',
    hint: 'You\'re home. You\'re finally home.',
    returnZone: 'neighborhood'
  }
};

// ===== ITEM DATA =====

export const ITEMS: Record<string, Item> = {
  bone: { name: '🦴 Bone', desc: 'A good bone. Smells familiar.', category: 'comfort' },
  treat: { name: '🍖 Treat', desc: 'Delicious! Restores happiness.', category: 'comfort' },
  toy: { name: '🧸 Toy', desc: 'A red ball. You remember this.', category: 'comfort' },
  key: { name: '🗝️ Key', desc: 'A small metal key.', category: 'key' },
  map_fragment: { name: '📋 Map Fragment', desc: 'Part of a map. Shows a street.', category: 'clue' },
  tree_clue: { name: '🌳 Tree Clue', desc: 'A tree you remember. Marked with a scratch.', category: 'clue' },
  friend: { name: '🐕 Friend', desc: 'A new companion!', category: 'comfort' },
  water_bottle: { name: '💧 Water Bottle', desc: 'Half-full water. Perfect for a hot day.', category: 'comfort' },
  photo: { name: '📸 Photo', desc: 'A photo of you and your human.', category: 'collectible' },
  collar_piece: { name: '🔗 Collar Buckle', desc: 'Part of your collar. You recognize it.', category: 'key' },
  warm_blanket: { name: '🧶 Warm Blanket', desc: 'Smells like your human. Comforting.', category: 'comfort' },
  favorite_toy: { name: '🧸 Favorite Toy', desc: 'Your old stuffed animal. Safe.', category: 'comfort' }
};

// ===== THREAT DATA =====

export const THREATS_DATA: Record<string, Threat> = {
  traffic: { name: 'Traffic', icon: '🚗', type: 'timing', description: 'Cars are zooming by! Time your crossing!', solve: 'Press SPACE when the gap is right', mangaText: 'SCREEEECH!', mangaType: 'near-miss' },
  cat: { name: 'Mean Cat', icon: '🐱', type: 'combat', description: 'A hissing cat blocks the path!', solve: 'Press SPACE in rhythm to scare it off', mangaText: 'SCRATCH!', mangaType: 'fight' },
  bully: { name: 'Bully Dog', icon: '🐕‍🦺', type: 'combat', description: 'A tough-looking dog growls at you!', solve: 'Press SPACE in rhythm to intimidate it', mangaText: 'GRRR!', mangaType: 'fight' },
  storm: { name: 'Thunderstorm', icon: '⛈️', type: 'comfort', description: 'Thunder roars! Find shelter quickly.', solve: 'Find shelter or use a comfort item', mangaText: 'BOOM!', mangaType: 'scare' },
  vacuum: { name: 'Vacuum Monster', icon: '🤖', type: 'sneak', description: 'The dreaded vacuum cleaner! Hide!', solve: 'Stay still when it approaches, move when safe', mangaText: 'VRRRRR!', mangaType: 'scare' }
};

// ===== COMPANION DATA =====

export const COMPANIONS_DATA: Record<string, Companion> = {
  stray_buddy: { id: 'stray_buddy', name: 'Buddy', breed: 'Golden Retriever', trait: 'Friendly', dialogue: ['Woof! Welcome to the park!', 'Home is where the fence is.', 'Follow the scent posts — they lead somewhere!'], color: '#DAA520', accentColor: '#FFD700', met: false, active: false },
  shelter_dog: { id: 'shelter_dog', name: 'Rex', breed: 'Mixed Breed', trait: 'Navigator', dialogue: ['I was here a long time ago. I remember the way out.', 'The kennels... they\'re not so bad if you find a friend.'], color: '#5a4a3a', accentColor: '#8a7a5a', met: false, active: false },
  park_stray: { id: 'park_stray', name: 'Luna', breed: 'Border Collie', trait: 'Smart', dialogue: ['I can help you find your way. I\'ve been watching things.', 'The apartment building has a back entrance.'], color: '#3a3a3a', accentColor: '#ffffff', met: false, active: false },
  neighborhood_dog: { id: 'neighborhood_dog', name: 'Max', breed: 'Labrador Retriever', trait: 'Finder', dialogue: ['I live nearby! Well, I lived nearby.', 'The house with the golden gate? That\'s the one!'], color: '#B8860B', accentColor: '#DAA520', met: false, active: false }
};

// Export all data as a single object for bootstrapping
export const GAME_DATA = { DOGS, ZONES, ITEMS, THREATS: THREATS_DATA, COMPANIONS: COMPANIONS_DATA };
