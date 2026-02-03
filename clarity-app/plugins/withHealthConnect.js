const { withAndroidManifest } = require('@expo/config-plugins');

const withHealthConnect = (config) => {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Add Health Connect permissions
    const permissions = [
      'android.permission.health.READ_SLEEP',
      'android.permission.health.READ_STEPS',
      'android.permission.health.READ_HEART_RATE',
      'android.permission.health.READ_HEART_RATE_VARIABILITY',
      'android.permission.health.READ_RESTING_HEART_RATE',
      'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
    ];

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    permissions.forEach((permission) => {
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === permission
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Add queries for Health Connect
    if (!manifest.queries) {
      manifest.queries = [];
    }

    // Add Health Connect package query
    const healthConnectQuery = {
      package: [{ $: { 'android:name': 'com.google.android.apps.healthdata' } }],
    };

    const hasHealthConnectQuery = manifest.queries.some(
      (q) => q.package?.some((p) => p.$?.['android:name'] === 'com.google.android.apps.healthdata')
    );

    if (!hasHealthConnectQuery) {
      manifest.queries.push(healthConnectQuery);
    }

    // Add intent filter for Health Connect permissions activity
    const application = manifest.application?.[0];
    if (application) {
      // Find or create the permissions rationale activity
      let permissionsActivity = application.activity?.find(
        (a) => a.$?.['android:name'] === '.PermissionsRationaleActivity'
      );

      if (!permissionsActivity) {
        // Add a new activity for Health Connect permissions
        if (!application.activity) {
          application.activity = [];
        }

        application.activity.push({
          $: {
            'android:name': 'com.anonymous.clarityapp.PermissionsRationaleActivity',
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
            },
          ],
        });
      }

      // Add intent filter to main activity for Health Connect data management
      const mainActivity = application.activity?.find(
        (a) => a.$?.['android:name'] === '.MainActivity'
      );

      if (mainActivity) {
        if (!mainActivity['intent-filter']) {
          mainActivity['intent-filter'] = [];
        }

        // Check if Health Connect intent filter already exists
        const hasHealthIntentFilter = mainActivity['intent-filter'].some(
          (f) => f.action?.some((a) => a.$?.['android:name']?.includes('health'))
        );

        if (!hasHealthIntentFilter) {
          mainActivity['intent-filter'].push({
            action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
          });
        }
      }
    }

    return config;
  });
};

module.exports = withHealthConnect;
