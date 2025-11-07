//
//  HapticManager.swift
//  Transplant Platform - Patient Mobile App
//
//  Haptic feedback manager for enhanced user experience
//

#if canImport(UIKit)
import UIKit
#endif

class HapticManager {
    static let shared = HapticManager()
    
    private init() {}
    
    // MARK: - Feedback Types
    
    func light() {
        #if canImport(UIKit)
        let impactFeedback = UIImpactFeedbackGenerator(style: .light)
        impactFeedback.impactOccurred()
        #endif
    }
    
    func medium() {
        #if canImport(UIKit)
        let impactFeedback = UIImpactFeedbackGenerator(style: .medium)
        impactFeedback.impactOccurred()
        #endif
    }
    
    func heavy() {
        #if canImport(UIKit)
        let impactFeedback = UIImpactFeedbackGenerator(style: .heavy)
        impactFeedback.impactOccurred()
        #endif
    }
    
    func success() {
        #if canImport(UIKit)
        let notificationFeedback = UINotificationFeedbackGenerator()
        notificationFeedback.notificationOccurred(.success)
        #endif
    }
    
    func warning() {
        #if canImport(UIKit)
        let notificationFeedback = UINotificationFeedbackGenerator()
        notificationFeedback.notificationOccurred(.warning)
        #endif
    }
    
    func error() {
        #if canImport(UIKit)
        let notificationFeedback = UINotificationFeedbackGenerator()
        notificationFeedback.notificationOccurred(.error)
        #endif
    }
    
    func selectionChanged() {
        #if canImport(UIKit)
        let selectionFeedback = UISelectionFeedbackGenerator()
        selectionFeedback.selectionChanged()
        #endif
    }
}