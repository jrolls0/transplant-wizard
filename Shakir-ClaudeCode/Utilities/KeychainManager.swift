//
//  KeychainManager.swift
//  Transplant Platform - Patient Mobile App
//
//  HIPAA-compliant secure storage for sensitive data
//

import Foundation
import Security

class KeychainManager {
    static let shared = KeychainManager()
    
    private let service = "com.organoptima.transplant-platform"
    
    private init() {}
    
    // MARK: - Token Management
    
    func storeAccessToken(_ token: String) {
        store(key: "access_token", value: token)
    }
    
    func getAccessToken() -> String? {
        return retrieve(key: "access_token")
    }
    
    func storeRefreshToken(_ token: String) {
        store(key: "refresh_token", value: token)
    }
    
    func getRefreshToken() -> String? {
        return retrieve(key: "refresh_token")
    }
    
    func storeUserID(_ userID: String) {
        store(key: "user_id", value: userID)
    }
    
    func getUserID() -> String? {
        return retrieve(key: "user_id")
    }
    
    func clearAllTokens() {
        delete(key: "access_token")
        delete(key: "refresh_token")
        delete(key: "user_id")
        
        // Clear all saved credentials
        if let accounts = getAllSavedAccounts() {
            for account in accounts {
                delete(key: "credentials_\(account)")
            }
        }
        delete(key: "saved_accounts")
    }
    
    // MARK: - Credential Management (for biometric login)
    
    func saveCredentials(email: String, password: String) {
        let credentials = UserCredentials(email: email, password: password)
        
        if let data = try? JSONEncoder().encode(credentials) {
            store(key: "credentials_\(email)", data: data)
            
            // Add to saved accounts list
            var savedAccounts = getAllSavedAccounts() ?? []
            if !savedAccounts.contains(email) {
                savedAccounts.append(email)
                if let accountsData = try? JSONEncoder().encode(savedAccounts) {
                    store(key: "saved_accounts", data: accountsData)
                }
            }
        }
    }
    
    func getSavedCredentials(for email: String) -> UserCredentials? {
        guard let data = retrieveData(key: "credentials_\(email)"),
              let credentials = try? JSONDecoder().decode(UserCredentials.self, from: data) else {
            return nil
        }
        return credentials
    }
    
    func deleteSavedCredentials(for email: String) {
        delete(key: "credentials_\(email)")
        
        // Remove from saved accounts list
        var savedAccounts = getAllSavedAccounts() ?? []
        savedAccounts.removeAll { $0 == email }
        
        if let accountsData = try? JSONEncoder().encode(savedAccounts) {
            store(key: "saved_accounts", data: accountsData)
        }
    }
    
    func getAllSavedAccounts() -> [String]? {
        guard let data = retrieveData(key: "saved_accounts"),
              let accounts = try? JSONDecoder().decode([String].self, from: data) else {
            return nil
        }
        return accounts
    }
    
    // MARK: - Biometric Keys
    
    func storeBiometricKey(_ key: String) {
        store(key: "biometric_key", value: key, requireBiometric: true)
    }
    
    func getBiometricKey() -> String? {
        return retrieve(key: "biometric_key")
    }

    // MARK: - Secure Key Storage (e.g., audit log encryption)

    func storeAuditEncryptionKey(_ keyData: Data) {
        store(key: "audit_encryption_key", data: keyData)
    }

    func getAuditEncryptionKey() -> Data? {
        retrieveData(key: "audit_encryption_key")
    }
    
    // MARK: - Private Methods
    
    private func store(key: String, value: String, requireBiometric: Bool = false) {
        guard let data = value.data(using: .utf8) else { return }
        store(key: key, data: data, requireBiometric: requireBiometric)
    }
    
    private func store(key: String, data: Data, requireBiometric: Bool = false) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: requireBiometric ? 
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly : kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        // Delete existing item
        SecItemDelete(query as CFDictionary)
        
        // Add new item
        let status = SecItemAdd(query as CFDictionary, nil)
        
        if status != errSecSuccess {
            print("Keychain store error: \(status)")
        }
    }
    
    private func retrieve(key: String) -> String? {
        guard let data = retrieveData(key: key) else { return nil }
        return String(data: data, encoding: .utf8)
    }
    
    private func retrieveData(key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess {
            return result as? Data
        } else {
            print("Keychain retrieve error: \(status)")
            return nil
        }
    }
    
    private func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        if status != errSecSuccess && status != errSecItemNotFound {
            print("Keychain delete error: \(status)")
        }
    }
}

// MARK: - Supporting Types

struct UserCredentials: Codable {
    let email: String
    let password: String
}
