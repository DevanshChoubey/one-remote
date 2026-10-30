export default {
  title: 'Settings',
  theme: 'Theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  volumeKeys: 'Phone volume keys control the TV',
  haptics: 'Vibrate on press',
  rooms: 'Rooms',
  roomsHint: 'Rename, reorder',
  roomName: 'Name of {name}',
  saveRoom: 'Save {name}',
  roomUp: 'Move {name} up',
  roomDown: 'Move {name} down',
  removeRoom: 'Remove {name}',
  roomNotEmpty: 'Move or remove its devices first',
  noRooms: 'No rooms yet. You add one when you name a device.',
  failed: "That didn't save. Try again.",
  privacy: 'Privacy',
  privacyHint: 'Local network only',
  privacyBody:
    'One Remote talks only to devices on your home network. It has no account, no ads and no analytics, and nothing is sent to a server.',
  about: 'About and licences',
  licenseApp: 'One Remote. The licence of the app as a whole is still to be decided.',
  licenseOss:
    'Built with Expo, React Native and other open-source libraries, each under its own licence.',
  licenseLgpl:
    'IR encoder (src/ir/lgpl): LGPL-2.1. Licence notice to be added here before release.',
} as const;
