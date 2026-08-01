import packageMetadata from '../../package.json';

export const APP_VERSION = packageMetadata.version;
export const BUILD_COMMIT = import.meta.env.VITE_BUILD_COMMIT || 'working-tree';
