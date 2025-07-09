/**
 * Token Manager JavaScript
 * Interface pour la gestion des tokens de partage PACS
 */

// Configuration - Merge server config with defaults
const SERVER_CONFIG = window.PACS_CONFIG || {};
const CONFIG = {
    REFRESH_INTERVAL: SERVER_CONFIG.REFRESH_INTERVAL || 30000,
    DEBUG_MODE: SERVER_CONFIG.DEBUG_MODE || false,
    TIME_UNITS: {
        DAY: 86400,
        HOUR: 3600,
        MINUTE: 60
    },
    CSS_CLASSES: {
        SUCCESS: 'bg-success',
        WARNING: 'bg-warning', 
        DANGER: 'bg-danger',
        PRIMARY: 'bg-primary',
        INFO: 'bg-info',
        TEXT_WHITE: 'text-white',
        TEXT_MUTED: 'text-muted',
        TEXT_DANGER: 'text-danger'
    },
    ICONS: {
        INFO: 'fas fa-info-circle',
        ERROR: 'fas fa-exclamation-triangle',
        SPINNER: 'fas fa-spinner fa-spin',
        TRASH: 'fas fa-trash',
        RETRY: 'fas fa-retry'
    },
    API_BASE: SERVER_CONFIG.API_BASE || window.location.origin,
    ENDPOINTS: {
        TOKENS: '/auth/tokens',
        EXPIRED_TOKENS: '/auth/tokens/expired',
        STATS: '/auth/tokens/stats',
        REVOKE: '/auth/tokens'
    }
};

let currentTokenToRevoke = null;

// Debug logging
if (CONFIG.DEBUG_MODE) {
    console.log('Token Manager loaded with config:', CONFIG);
}

// Format timestamp to readable date
function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString('fr-FR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format duration to readable string
function formatDuration(seconds) {
    if (seconds < 0) return `<span class="badge ${CONFIG.CSS_CLASSES.DANGER}">Expiré</span>`;
    
    const days = Math.floor(seconds / CONFIG.TIME_UNITS.DAY);
    const hours = Math.floor((seconds % CONFIG.TIME_UNITS.DAY) / CONFIG.TIME_UNITS.HOUR);
    const minutes = Math.floor((seconds % CONFIG.TIME_UNITS.HOUR) / CONFIG.TIME_UNITS.MINUTE);
    
    let duration = '';
    if (days > 0) duration = `${days}j ${hours}h`;
    else if (hours > 0) duration = `${hours}h ${minutes}m`;
    else duration = `${minutes}m`;
    
    const badgeClass = seconds > CONFIG.TIME_UNITS.DAY ? CONFIG.CSS_CLASSES.SUCCESS : 
                      seconds > CONFIG.TIME_UNITS.HOUR ? CONFIG.CSS_CLASSES.WARNING : 
                      CONFIG.CSS_CLASSES.DANGER;
    return `<span class="badge ${badgeClass}">${duration}</span>`;
}

// Get resource description
function getResourceDescription(resources) {
    if (!resources || resources.length === 0) return 'Aucune ressource';
    const resource = resources[0];
    const level = resource.Level || 'study';
    const id = resource.DicomUid || resource.OrthancId || 'N/A';
    return `<small class="${CONFIG.CSS_CLASSES.TEXT_MUTED}">${level.toUpperCase()}: ${id.substring(0, 16)}...</small>`;
}

// Check if token usage is suspicious (fraud detection)
function isSuspiciousUsage(token) {
    if (!token.created_at || !token.current_uses) return false;
    
    const hoursElapsed = (Date.now() / 1000 - token.created_at) / 3600;
    const usageRate = token.current_uses / Math.max(hoursElapsed, 1);
    
    // Suspicious if more than 10 uses per hour or 50 uses in less than 4 hours
    return usageRate > 10 || (token.current_uses >= 50 && hoursElapsed < 4);
}

// Get expiration reason
function getExpirationReason(token) {
    if (token.current_uses >= token.max_uses) {
        return `<span class="badge ${CONFIG.CSS_CLASSES.WARNING}">Limite atteinte</span>`;
    }
    if (token.remaining_seconds <= 0) {
        return `<span class="badge ${CONFIG.CSS_CLASSES.INFO}">Temps écoulé</span>`;
    }
    return `<span class="badge ${CONFIG.CSS_CLASSES.DANGER}">Révoqué</span>`;
}

// Generic API call function
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const url = `${CONFIG.API_BASE}${endpoint}`;
        const options = {
            method,
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            credentials: 'include'
        };

        if (data) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API call failed for ${endpoint}:`, error);
        throw error;
    }
}

// Fetch tokens from API
async function fetchTokens() {
    const data = await apiCall(CONFIG.ENDPOINTS.TOKENS);
    return data.tokens || [];
}

// Fetch expired tokens from API
async function fetchExpiredTokens() {
    try {
        const data = await apiCall(CONFIG.ENDPOINTS.EXPIRED_TOKENS);
        return data.tokens || [];
    } catch (error) {
        console.log('Expired tokens endpoint not available:', error);
        return [];
    }
}

// Fetch statistics from API
async function fetchStatistics() {
    return await apiCall(CONFIG.ENDPOINTS.STATS);
}

// Revoke a token
async function revokeToken(tokenId) {
    return await apiCall(`${CONFIG.ENDPOINTS.REVOKE}/${tokenId}`, 'DELETE');
}

// Show success toast
function showSuccessToast(message = 'Token révoqué avec succès') {
    const toast = document.getElementById('successToast');
    const toastBody = toast.querySelector('.toast-body');
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Show error toast
function showErrorToast(message = 'Une erreur est survenue') {
    const toast = document.getElementById('errorToast');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Create tokens table HTML
function createTokensTableHTML(tokens) {
    if (tokens.length === 0) {
        return `
            <div class="text-center p-4">
                <i class="${CONFIG.ICONS.INFO} fa-2x mb-3 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>
                <p class="${CONFIG.CSS_CLASSES.TEXT_MUTED}">Aucun token actif trouvé.</p>
            </div>
        `;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-dark table-hover mb-0">
                <thead>
                    <tr>
                        <th><i class="fas fa-tag me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Type</th>
                        <th><i class="fas fa-file-medical me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Ressource</th>
                        <th><i class="fas fa-calendar me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Créé le</th>
                        <th><i class="fas fa-clock me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Expire dans</th>
                        <th><i class="fas fa-chart-bar me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Utilisation</th>
                        <th><i class="fas fa-cog me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    tokens.forEach(token => {
        const usagePercent = Math.round((token.current_uses / token.max_uses) * 100);
        const usageClass = usagePercent > 75 ? CONFIG.CSS_CLASSES.DANGER : 
                          usagePercent > 50 ? CONFIG.CSS_CLASSES.WARNING : 
                          CONFIG.CSS_CLASSES.SUCCESS;
        
        const typeClass = token.token_type === 'ohif-viewer-publication' ? CONFIG.CSS_CLASSES.PRIMARY : CONFIG.CSS_CLASSES.INFO;
        const isSuspicious = isSuspiciousUsage(token);
        
        html += `
            <tr ${isSuspicious ? 'class="fraud-indicator"' : ''}>
                <td>
                    <span class="badge ${typeClass}">
                        ${token.token_type === 'ohif-viewer-publication' ? 'OHIF' : 'Instant'}
                    </span>
                    ${isSuspicious ? `<i class="fas fa-exclamation-triangle ${CONFIG.CSS_CLASSES.TEXT_DANGER} ms-1" title="Usage suspect"></i>` : ''}
                </td>
                <td>${getResourceDescription(token.resources)}</td>
                <td><small>${formatDate(token.created_at)}</small></td>
                <td>${formatDuration(token.remaining_seconds)}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="progress me-2" style="width: 80px; height: 8px;">
                            <div class="progress-bar ${usageClass}" style="width: ${usagePercent}%"></div>
                        </div>
                        <small class="${CONFIG.CSS_CLASSES.TEXT_MUTED}">${token.current_uses}/${token.max_uses}</small>
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="confirmRevoke('${token.id}', '${token.token_type}')">
                        <i class="${CONFIG.ICONS.TRASH} ${CONFIG.CSS_CLASSES.TEXT_DANGER}"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    return html;
}

// Create expired tokens table HTML
function createExpiredTokensTableHTML(tokens) {
    if (tokens.length === 0) {
        return `
            <div class="text-center p-4">
                <i class="fas fa-clock ${CONFIG.CSS_CLASSES.TEXT_MUTED} fa-2x mb-3"></i>
                <p class="${CONFIG.CSS_CLASSES.TEXT_MUTED}">Aucun token expiré récent.</p>
            </div>
        `;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-dark table-hover mb-0">
                <thead>
                    <tr>
                        <th><i class="fas fa-tag me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Type</th>
                        <th><i class="fas fa-file-medical me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Ressource</th>
                        <th><i class="fas fa-calendar me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Créé le</th>
                        <th><i class="fas fa-clock me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Expiré le</th>
                        <th><i class="fas fa-chart-bar me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Utilisation</th>
                        <th><i class="fas fa-info-circle me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Raison</th>
                    </tr>
                </thead>
                <tbody>
    `;

    tokens.forEach(token => {
        const usagePercent = Math.round((token.current_uses / token.max_uses) * 100);
        const usageClass = usagePercent > 75 ? CONFIG.CSS_CLASSES.DANGER : 
                          usagePercent > 50 ? CONFIG.CSS_CLASSES.WARNING : 
                          CONFIG.CSS_CLASSES.SUCCESS;
        
        const typeClass = token.token_type === 'ohif-viewer-publication' ? CONFIG.CSS_CLASSES.PRIMARY : CONFIG.CSS_CLASSES.INFO;
        const isSuspicious = isSuspiciousUsage(token);
        
        html += `
            <tr class="expired-token ${isSuspicious ? 'fraud-indicator' : ''}">
                <td>
                    <span class="badge ${typeClass}">
                        ${token.token_type === 'ohif-viewer-publication' ? 'OHIF' : 'Instant'}
                    </span>
                    ${isSuspicious ? `<i class="fas fa-exclamation-triangle ${CONFIG.CSS_CLASSES.TEXT_DANGER} ms-1" title="Usage suspect détecté"></i>` : ''}
                </td>
                <td>${getResourceDescription(token.resources)}</td>
                <td><small>${formatDate(token.created_at)}</small></td>
                <td><small>${token.expired_at ? formatDate(token.expired_at) : 'N/A'}</small></td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="progress me-2" style="width: 80px; height: 8px;">
                            <div class="progress-bar ${usageClass}" style="width: ${usagePercent}%"></div>
                        </div>
                        <small class="${CONFIG.CSS_CLASSES.TEXT_MUTED}">${token.current_uses}/${token.max_uses}</small>
                    </div>
                </td>
                <td>${getExpirationReason(token)}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    return html;
}

// Update statistics display
function updateStatistics(stats) {
    document.getElementById('totalTokens').textContent = stats.total_active_tokens || 0;
    document.getElementById('ohifTokens').textContent = stats.tokens_by_type['ohif-viewer-publication'] || 0;
    document.getElementById('instantTokens').textContent = stats.tokens_by_type['viewer-instant-link'] || 0;
    document.getElementById('highUsageTokens').textContent = stats.tokens_by_usage['high'] || 0;
}

// Confirm token revocation
function confirmRevoke(tokenId, tokenType) {
    currentTokenToRevoke = tokenId;
    
    const typeClass = tokenType === 'ohif-viewer-publication' ? CONFIG.CSS_CLASSES.PRIMARY : CONFIG.CSS_CLASSES.INFO;
    
    document.getElementById('tokenDetails').innerHTML = `
        <strong>Token ID:</strong> <code class="token-id">${tokenId}</code><br>
        <strong>Type:</strong> <span class="badge ${typeClass}">${tokenType}</span>
    `;
    
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    modal.show();
}

// Handle confirm revoke button
document.getElementById('confirmRevokeBtn').addEventListener('click', async function() {
    if (!currentTokenToRevoke) return;
    
    const button = this;
    const originalHTML = button.innerHTML;
    
    try {
        // Show loading state
        button.innerHTML = `<i class="${CONFIG.ICONS.SPINNER} me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Révocation...`;
        button.disabled = true;
        
        await revokeToken(currentTokenToRevoke);
        
        // Hide modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
        modal.hide();
        
        // Show success message
        showSuccessToast();
        
        // Refresh data
        await loadData();
        
    } catch (error) {
        showErrorToast('Erreur lors de la révocation: ' + error.message);
    } finally {
        // Reset button
        button.innerHTML = originalHTML;
        button.disabled = false;
        currentTokenToRevoke = null;
    }
});

// Load all data
async function loadData() {
    const container = document.getElementById('tokensContainer');
    const expiredContainer = document.getElementById('expiredTokensContainer');
    
    try {
        // Show loading state
        container.innerHTML = `
            <div class="loading">
                <i class="${CONFIG.ICONS.SPINNER} fa-2x mb-3 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>
                <p>Chargement des tokens...</p>
            </div>
        `;
        
        expiredContainer.innerHTML = `
            <div class="loading">
                <i class="${CONFIG.ICONS.SPINNER} fa-2x mb-3 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>
                <p>Chargement des tokens expirés...</p>
            </div>
        `;
        
        // Fetch data in parallel
        const [tokens, expiredTokens, stats] = await Promise.all([
            fetchTokens(),
            fetchExpiredTokens(),
            fetchStatistics()
        ]);
        
        // Update displays
        updateStatistics(stats);
        container.innerHTML = createTokensTableHTML(tokens);
        expiredContainer.innerHTML = createExpiredTokensTableHTML(expiredTokens);
        
        // Update expired tokens count
        document.getElementById('expiredTokensCount').textContent = expiredTokens.length;
        
    } catch (error) {
        container.innerHTML = `
            <div class="text-center p-4">
                <i class="${CONFIG.ICONS.ERROR} fa-2x mb-3 ${CONFIG.CSS_CLASSES.TEXT_DANGER}"></i>
                <p class="${CONFIG.CSS_CLASSES.TEXT_DANGER}">Erreur lors du chargement: ${error.message}</p>
                <button class="btn btn-outline-primary" onclick="loadData()">
                    <i class="${CONFIG.ICONS.RETRY} me-1 ${CONFIG.CSS_CLASSES.TEXT_WHITE}"></i>Réessayer
                </button>
            </div>
        `;
        
        expiredContainer.innerHTML = `
            <div class="text-center p-4">
                <i class="${CONFIG.ICONS.ERROR} fa-2x mb-3 ${CONFIG.CSS_CLASSES.TEXT_DANGER}"></i>
                <p class="${CONFIG.CSS_CLASSES.TEXT_DANGER}">Erreur lors du chargement des tokens expirés</p>
            </div>
        `;
        
        showErrorToast('Erreur lors du chargement des données');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    
    // Auto-refresh using configured interval
    setInterval(loadData, CONFIG.REFRESH_INTERVAL);
});