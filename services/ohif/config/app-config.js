// =============================================================================
// OHIF VIEWER CONFIGURATION FOR PACS INTEGRATION
// =============================================================================
// Configuration for OHIF v3.10.2 medical imaging viewer
// Optimized for Orthanc PACS integration with French localization

window.config = {
  // =============================================================================
  // ROUTING & UI CONFIGURATION
  // =============================================================================
  routerBasename: '/ohif',                     // Base URL path for OHIF
  showStudyList: true,                         // Display study list on startup
  useRelativeUrls: true,                       // Use relative URLs for better proxy support
  extensions: [],                              // Additional OHIF extensions (none configured)
  modes: [],                                   // Additional viewing modes (none configured)
  
  // =============================================================================
  // USER EXPERIENCE SETTINGS
  // =============================================================================
  showWarningMessageForCrossOrigin: true,     // Warn about cross-origin issues
  showCPUFallbackMessage: true,               // Show CPU fallback warnings
  showLoadingIndicator: true,                 // Display loading indicators
  experimentalStudyBrowserSort: false,        // Disable experimental sorting
  strictZSpacingForVolumeViewport: true,      // Enforce strict Z-spacing for 3D

  // =============================================================================
  // PERFORMANCE OPTIMIZATION
  // =============================================================================
  // Study prefetching for faster navigation between studies
  studyPrefetcher: {
    enabled: true,                             // Enable study prefetching
    displaySetsCount: 2,                       // Number of display sets to prefetch
    maxNumPrefetchRequests: 10,                // Maximum concurrent prefetch requests
    order: 'closest',                          // Prefetch order strategy
  },

  // =============================================================================
  // INTERNATIONALIZATION (I18N)
  // =============================================================================
  // French as primary language for medical environment
  i18n: {
    defaultLanguage: 'fr',                     // Default language: French
    languages: ['fr', 'en'],                   // Available languages: French, English
    debug: false,                              // Set to true for debugging missing translation keys
    detectLanguage: false                      // Don't auto-detect browser language
  },

  // =============================================================================
  // DICOM DATA SOURCE CONFIGURATION
  // =============================================================================
  defaultDataSourceName: 'dicomweb',          // Default data source name
  
  dataSources: [
    {
      // DICOMweb data source for Orthanc PACS integration
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        // =============================================================================
        // ORTHANC SERVER INTEGRATION
        // =============================================================================
        friendlyName: 'Orthanc Server',       // Display name for the PACS server
        name: 'Orthanc',                      // Internal server name
        
        // =============================================================================
        // DICOMWEB API ENDPOINTS
        // =============================================================================
        // These endpoints are proxied through nginx with authentication
        wadoUriRoot: '/wado',                 // WADO-URI endpoint for image retrieval
        qidoRoot: '/dicom-web',               // QIDO-RS endpoint for study/series queries
        wadoRoot: '/dicom-web',               // WADO-RS endpoint for image retrieval
        
        // =============================================================================
        // DICOMWEB PROTOCOL SETTINGS
        // =============================================================================
        qidoSupportsIncludeField: false,     // Orthanc doesn't support includeField parameter
        imageRendering: 'wadors',             // Use WADO-RS for image rendering
        thumbnailRendering: 'wadors',         // Use WADO-RS for thumbnail rendering
        
        // =============================================================================
        // UPLOAD & MULTIPART SETTINGS
        // =============================================================================
        dicomUploadEnabled: true,             // Enable DICOM file upload to PACS
        omitQuotationForMultipartRequest: true, // Orthanc compatibility for multipart requests
      },
    },
  ],
};