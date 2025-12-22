//
//  ConsentFlowView.swift
//  Transplant Platform - Patient Mobile App
//
//  Handles the flow of both consent forms during registration
//

import SwiftUI

struct ConsentFlowView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @State private var currentStep: ConsentStep = .services
    @State private var servicesConsentComplete = false
    @State private var medicalRecordsConsentComplete = false
    
    enum ConsentStep {
        case services
        case medicalRecords
        case complete
    }
    
    var body: some View {
        Group {
            switch currentStep {
            case .services:
                ServicesConsentView {
                    servicesConsentComplete = true
                    currentStep = .medicalRecords
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing),
                    removal: .move(edge: .leading)
                ))
                
            case .medicalRecords:
                MedicalRecordsConsentView {
                    medicalRecordsConsentComplete = true
                    currentStep = .complete
                    // Refresh user status to reflect consent completion
                    Task {
                        await authManager.refreshUserStatus()
                    }
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing),
                    removal: .move(edge: .leading)
                ))
                
            case .complete:
                // Show completion screen briefly before transitioning
                ConsentCompleteView()
                    .onAppear {
                        // Refresh user status which will update allConsentsSigned
                        Task {
                            await authManager.refreshUserStatus()
                        }
                    }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: currentStep)
        .onAppear {
            // Check if any consents are already signed
            checkExistingConsents()
        }
    }
    
    private func checkExistingConsents() {
        if let user = authManager.currentUser {
            if user.servicesConsentSigned == true {
                servicesConsentComplete = true
                if user.medicalRecordsConsentSigned == true {
                    medicalRecordsConsentComplete = true
                    currentStep = .complete
                } else {
                    currentStep = .medicalRecords
                }
            }
        }
    }
}

// MARK: - Consent Complete View

struct ConsentCompleteView: View {
    @State private var showCheckmark = false
    
    var body: some View {
        ZStack {
            Color(.systemGroupedBackground)
                .ignoresSafeArea()
            
            VStack(spacing: 24) {
                ZStack {
                    Circle()
                        .fill(Color.green.opacity(0.15))
                        .frame(width: 120, height: 120)
                    
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 80))
                        .foregroundColor(.green)
                        .scaleEffect(showCheckmark ? 1.0 : 0.5)
                        .opacity(showCheckmark ? 1.0 : 0.0)
                }
                
                VStack(spacing: 12) {
                    Text("All Set!")
                        .font(.system(size: 28, weight: .bold))
                    
                    Text("Thank you for completing the consent forms. You can now access your transplant dashboard.")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle())
                    .scaleEffect(1.2)
                    .padding(.top, 20)
                
                Text("Loading your dashboard...")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
                showCheckmark = true
            }
        }
    }
}

#Preview {
    ConsentFlowView()
        .environmentObject(AuthenticationManager())
}
