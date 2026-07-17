// Config OAuth des fournisseurs de synchronisation cloud.
// À renseigner après enregistrement des apps :
//  - Dropbox App Console (Scoped access, App folder) → App key
//  - Google Cloud (OAuth Client ID « Application Web », scope drive.appdata)
// Redirection / origines à whitelister :
//  - Dropbox  Redirect URI          : https://davidmoret.github.io/  (+ http://localhost:5173/)
//  - Google   JavaScript origins    : https://davidmoret.github.io   (+ http://localhost:5173)

// Nom du fichier de backup déposé dans le dossier d'app de chaque fournisseur.
export const REMOTE_FILENAME = 'ram-backup.rambak';

// URI de redirection OAuth (racine de l'app, base Vite '/').
export const REDIRECT_URI = `${location.origin}/`;

export const DROPBOX = {
  clientId: '55nh1es71lgqt4z', // App key Dropbox
  authUrl: 'https://www.dropbox.com/oauth2/authorize',
  tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
};

export const GOOGLE = {
  clientId: '1029047383812-sjif18vqoja04qnjlgprhh16n2kgreid.apps.googleusercontent.com', // Client ID Google (OAuth Web)
  scope: 'https://www.googleapis.com/auth/drive.appdata',
};

// Un fournisseur est configuré si son identifiant est renseigné.
export const isConfigured = (p) => Boolean(p.clientId);
