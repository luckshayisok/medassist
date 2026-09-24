/**
 * Regression: in Expo Go on Android (SDK 53+), merely importing expo-notifications throws and
 * crashed the app. The loader must never require it there.
 */
describe('notifications module loader', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-constants');
    jest.dontMock('expo-notifications');
  });

  function setup(platform: 'android' | 'ios', env: 'storeClient' | 'standalone' | 'bare') {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { executionEnvironment: env },
      ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone', Bare: 'bare' },
    }));
    const requireSpy = jest.fn(() => ({ scheduleNotificationAsync: jest.fn() }));
    jest.doMock('expo-notifications', () => {
      requireSpy();
      if (platform === 'android' && env === 'storeClient') throw new Error('removed from Expo Go');
      return { scheduleNotificationAsync: jest.fn() };
    });
    const RN = require('react-native');
    Object.defineProperty(RN.Platform, 'OS', { get: () => platform, configurable: true });
    const mod = require('../notifications/module') as typeof import('../notifications/module');
    return { mod, requireSpy };
  }

  it('does not load expo-notifications in Expo Go on Android (would throw)', () => {
    const { mod, requireSpy } = setup('android', 'storeClient');
    expect(() => mod.getNotifications()).not.toThrow();
    expect(mod.getNotifications()).toBeNull();
    expect(mod.unsupportedReason()).toBe('expo-go-android');
    expect(requireSpy).not.toHaveBeenCalled();
  });

  it('loads it in a development/production build on Android', () => {
    const { mod } = setup('android', 'bare');
    expect(mod.getNotifications()).not.toBeNull();
  });

  it('loads it in Expo Go on iOS (local notifications still work there)', () => {
    const { mod } = setup('ios', 'storeClient');
    expect(mod.getNotifications()).not.toBeNull();
  });
});
