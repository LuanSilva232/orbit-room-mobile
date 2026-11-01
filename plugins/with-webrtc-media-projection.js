const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

const REQUIRED_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
];
const ENABLE_PROJECTION_SERVICE =
  'com.oney.WebRTCModule.WebRTCModuleOptions.getInstance().enableMediaProjectionService = true';

function withProjectionPermissions(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const permissions = manifest['uses-permission'] ?? [];

    for (const permission of REQUIRED_PERMISSIONS) {
      if (!permissions.some((entry) => entry.$?.['android:name'] === permission)) {
        permissions.push({ $: { 'android:name': permission } });
      }
    }

    manifest['uses-permission'] = permissions;
    return modConfig;
  });
}

function withProjectionServiceEnabled(config) {
  return withMainActivity(config, (modConfig) => {
    const { language } = modConfig.modResults;
    let { contents } = modConfig.modResults;

    if (
      contents.includes(ENABLE_PROJECTION_SERVICE) ||
      contents.includes('options.enableMediaProjectionService = true')
    ) {
      return modConfig;
    }

    if (language === 'kt') {
      const onCreate = /override fun onCreate\(savedInstanceState: Bundle\?\)\s*\{/;
      if (!onCreate.test(contents)) {
        throw new Error(
          'O plugin de WebRTC não encontrou onCreate na MainActivity Kotlin.'
        );
      }
      contents = contents.replace(
        onCreate,
        (match) => `${match}\n    ${ENABLE_PROJECTION_SERVICE}`
      );
    } else {
      const onCreate =
        /protected void onCreate\([^)]*Bundle\s+savedInstanceState[^)]*\)\s*\{/;
      if (!onCreate.test(contents)) {
        throw new Error(
          'O plugin de WebRTC não encontrou onCreate na MainActivity Java.'
        );
      }
      contents = contents.replace(
        onCreate,
        (match) =>
          `${match}\n    com.oney.WebRTCModule.WebRTCModuleOptions options = com.oney.WebRTCModule.WebRTCModuleOptions.getInstance();\n    options.enableMediaProjectionService = true;`
      );
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

module.exports = function withWebRtcMediaProjection(config) {
  return withProjectionServiceEnabled(withProjectionPermissions(config));
};
