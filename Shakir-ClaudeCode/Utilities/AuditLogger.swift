//
//  AuditLogger.swift
//  Transplant Platform - Patient Mobile App
//
//  HIPAA-compliant audit logging for mobile app events
//

import Foundation
import os.log
#if canImport(UIKit)
import UIKit
#endif

class AuditLogger {
    static let shared = AuditLogger()
    
    private let logger = Logger(subsystem: "com.organoptima.transplant-platform", category: "audit")
    private let dateFormatter: ISO8601DateFormatter
    
    private init() {
        dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    }
    
    // MARK: - Authentication Events
    
    func logAuthentication(userId: String?, action: AuthAction, success: Bool, error: String? = nil) {
        let event = AuditEvent(
            eventType: .authentication,
            userId: userId,
            action: action.rawValue,
            success: success,
            error: error,
            metadata: [
                "device_id": getDeviceId(),
                "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
            ]
        )
        
        logEvent(event)
    }
    
    // MARK: - Data Access Events
    
    func logDataAccess(userId: String, dataType: String, action: DataAction, success: Bool, error: String? = nil) {
        let event = AuditEvent(
            eventType: .dataAccess,
            userId: userId,
            action: "\(action.rawValue)_\(dataType)",
            success: success,
            error: error,
            metadata: [
                "data_type": dataType,
                "access_method": "mobile_app"
            ]
        )
        
        logEvent(event)
    }
    
    // MARK: - PHI Events
    
    func logPHIAccess(userId: String, phiType: String, action: PHIAction, patientId: String? = nil) {
        let event = AuditEvent(
            eventType: .phiAccess,
            userId: userId,
            action: "\(action.rawValue)_\(phiType)",
            success: true,
            metadata: [
                "phi_type": phiType,
                "patient_id": patientId ?? userId,
                "access_context": "patient_self_access"
            ]
        )
        
        logEvent(event)
    }
    
    // MARK: - Security Events
    
    func logSecurityEvent(userId: String?, event: SecurityEvent, details: String? = nil) {
        let auditEvent = AuditEvent(
            eventType: .security,
            userId: userId,
            action: event.rawValue,
            success: true,
            metadata: [
                "security_event": event.rawValue,
                "details": details ?? "",
                "timestamp": dateFormatter.string(from: Date())
            ]
        )
        
        logEvent(auditEvent)
    }
    
    // MARK: - Network Events
    
    func logNetworkChange(status: NetworkStatus, isConnected: Bool, connectionType: String) {
        let event = AuditEvent(
            eventType: .system,
            userId: nil,
            action: "network_status_change",
            success: true,
            metadata: [
                "network_status": status.description,
                "is_connected": String(isConnected),
                "connection_type": connectionType
            ]
        )
        
        logEvent(event)
    }
    
    // MARK: - App Lifecycle Events
    
    func logAppEvent(event: AppEvent, userId: String? = nil) {
        let auditEvent = AuditEvent(
            eventType: .system,
            userId: userId,
            action: event.rawValue,
            success: true,
            metadata: [
                "app_event": event.rawValue,
                "app_state": getAppState()
            ]
        )
        
        logEvent(auditEvent)
    }
    
    // MARK: - Consent Events
    
    func logConsentEvent(userId: String, consentType: String, action: ConsentAction, metadata: [String: String] = [:]) {
        var eventMetadata = metadata
        eventMetadata["consent_type"] = consentType
        eventMetadata["legal_basis"] = "patient_consent"
        
        let event = AuditEvent(
            eventType: .consent,
            userId: userId,
            action: "\(action.rawValue)_\(consentType)",
            success: true,
            metadata: eventMetadata
        )
        
        logEvent(event)
    }
    
    func logROISignature(userId: String, digitalSignature: String, success: Bool, error: String? = nil) {
        let event = AuditEvent(
            eventType: .consent,
            userId: userId,
            action: "roi_signature",
            success: success,
            error: error,
            metadata: [
                "consent_type": "roi_authorization",
                "signature_method": "digital",
                "signature_length": String(digitalSignature.count),
                "legal_basis": "hipaa_authorization",
                "phi_disclosure": "authorized"
            ]
        )
        
        logEvent(event)
    }
    
    // MARK: - Private Methods
    
    private func logEvent(_ event: AuditEvent) {
        // Log to system logger
        logger.info("AUDIT: \(event.description)")
        
        // Store locally for offline logging
        storeEventLocally(event)
        
        // Send to backend if connected
        if NetworkMonitor.shared.isConnected {
            Task {
                await sendEventToBackend(event)
            }
        }
    }
    
    private func storeEventLocally(_ event: AuditEvent) {
        // Store in local database/file for offline capability
        // This ensures audit logs are not lost even when offline
        let userDefaults = UserDefaults.standard
        var storedEvents = userDefaults.array(forKey: "pending_audit_events") as? [Data] ?? []
        
        if let eventData = try? JSONEncoder().encode(event) {
            storedEvents.append(eventData)
            
            // Keep only last 1000 events locally
            if storedEvents.count > 1000 {
                storedEvents = Array(storedEvents.suffix(1000))
            }
            
            userDefaults.set(storedEvents, forKey: "pending_audit_events")
        }
    }
    
    private func sendEventToBackend(_ event: AuditEvent) async {
        // Implementation would send to backend audit API
        // For now, we'll just log that we would send
        logger.debug("Would send audit event to backend: \(event.eventType.rawValue)")
    }
    
    private func getAppState() -> String {
        #if canImport(UIKit)
        switch UIApplication.shared.applicationState {
        case .active:
            return "active"
        case .inactive:
            return "inactive"
        case .background:
            return "background"
        @unknown default:
            return "unknown"
        }
        #else
        return "macOS"
        #endif
    }
    
    private func getDeviceId() -> String {
        #if canImport(UIKit)
        return UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
        #else
        return "macOS_device"
        #endif
    }
}

// MARK: - Supporting Types

struct AuditEvent: Codable {
    let id: String
    let timestamp: Date
    let eventType: EventType
    let userId: String?
    let action: String
    let success: Bool
    let error: String?
    let metadata: [String: String]
    
    init(eventType: EventType, userId: String?, action: String, success: Bool, error: String? = nil, metadata: [String: String] = [:]) {
        self.id = UUID().uuidString
        self.timestamp = Date()
        self.eventType = eventType
        self.userId = userId
        self.action = action
        self.success = success
        self.error = error
        self.metadata = metadata
    }
    
    var description: String {
        return "[\(eventType.rawValue)] \(action) - User: \(userId ?? "anonymous") - Success: \(success)"
    }
}

enum EventType: String, Codable {
    case authentication = "auth"
    case dataAccess = "data"
    case phiAccess = "phi"
    case security = "security"
    case system = "system"
    case consent = "consent"
}

enum AuthAction: String {
    case login = "login"
    case logout = "logout"
    case loginAttempt = "login_attempt"
    case passwordReset = "password_reset"
    case biometricAuth = "biometric_auth"
    case sessionExpired = "session_expired"
}

enum DataAction: String {
    case create = "create"
    case read = "read"
    case update = "update"
    case delete = "delete"
    case export = "export"
}

enum PHIAction: String {
    case view = "view"
    case edit = "edit"
    case share = "share"
    case export = "export"
    case print = "print"
}

enum SecurityEvent: String {
    case screenCapture = "screen_capture_blocked"
    case privacyOverlay = "privacy_overlay_shown"
    case biometricEnabled = "biometric_enabled"
    case biometricDisabled = "biometric_disabled"
    case sessionTimeout = "session_timeout"
    case deviceLock = "device_lock"
}

enum AppEvent: String {
    case launch = "app_launch"
    case terminate = "app_terminate"
    case background = "app_background"
    case foreground = "app_foreground"
    case memoryWarning = "memory_warning"
}

enum ConsentAction: String {
    case granted = "granted"
    case revoked = "revoked"
    case viewed = "viewed"
    case signed = "signed"
}