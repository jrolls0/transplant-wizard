//
//  NetworkMonitor.swift
//  Transplant Platform - Patient Mobile App
//
//  Network connectivity monitoring for HIPAA compliance
//

import Foundation
import Network
import Combine

class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()
    
    @Published var status: NetworkStatus = .unknown
    @Published var isConnected: Bool = false
    
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor")
    
    private init() {
        startMonitoring()
    }
    
    deinit {
        stopMonitoring()
    }
    
    // MARK: - Monitoring
    
    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.updateNetworkStatus(path: path)
            }
        }
        monitor.start(queue: queue)
    }
    
    private func stopMonitoring() {
        monitor.cancel()
    }
    
    private func updateNetworkStatus(path: NWPath) {
        switch path.status {
        case .satisfied:
            isConnected = true
            
            // Check connection quality
            if path.isExpensive {
                status = .limited
            } else {
                status = .connected
            }
            
        case .unsatisfied:
            isConnected = false
            status = .disconnected
            
        case .requiresConnection:
            isConnected = false
            status = .limited
            
        @unknown default:
            isConnected = false
            status = .unknown
        }
        
        // Log network changes for HIPAA audit
        AuditLogger.shared.logNetworkChange(
            status: status,
            isConnected: isConnected,
            connectionType: getConnectionType(path: path)
        )
    }
    
    private func getConnectionType(path: NWPath) -> String {
        if path.usesInterfaceType(.wifi) {
            return "WiFi"
        } else if path.usesInterfaceType(.cellular) {
            return "Cellular"
        } else if path.usesInterfaceType(.wiredEthernet) {
            return "Ethernet"
        } else {
            return "Unknown"
        }
    }
    
    // MARK: - Public Methods
    
    func requiresConnection() -> Bool {
        return !isConnected
    }
    
    func isExpensiveConnection() -> Bool {
        return monitor.currentPath.isExpensive
    }
    
    func isConstrainedConnection() -> Bool {
        return monitor.currentPath.isConstrained
    }
}