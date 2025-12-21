//
//  WereYouReferredView.swift
//  Transplant Platform - Patient Mobile App
//
//  First launch screen asking if user was referred by a DUSW
//

import SwiftUI

struct WereYouReferredView: View {
    @EnvironmentObject private var appState: AppState
    @Binding var showReferralFlow: Bool
    @Binding var wasReferred: Bool?

    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 16) {
                Image(systemName: "person.badge.plus")
                    .font(.system(size: 70))
                    .foregroundColor(.white)

                Text("Welcome to\nTransplant Wizard")
                    .font(.largeTitle)
                    .fontWeight(.light)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.white)

                Text("Your transplant journey starts here")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.9))
            }
            .padding(.top, 60)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.4, green: 0.5, blue: 0.92),
                        Color(red: 0.46, green: 0.3, blue: 0.64)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )

            // Content
            VStack(spacing: 30) {
                Spacer()

                VStack(spacing: 16) {
                    Text("Were you referred?")
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)

                    Text("Did a dialysis social worker send you a referral email to join Transplant Wizard?")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                }

                Spacer()

                // Buttons
                VStack(spacing: 16) {
                    Button(action: {
                        wasReferred = true
                    }) {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                            Text("Yes, I was referred")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(
                            LinearGradient(
                                gradient: Gradient(colors: [
                                    Color(red: 0.4, green: 0.5, blue: 0.92),
                                    Color(red: 0.46, green: 0.3, blue: 0.64)
                                ]),
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }

                    Button(action: {
                        wasReferred = false
                        showReferralFlow = false
                    }) {
                        HStack {
                            Image(systemName: "xmark.circle")
                            Text("No, I want to register")
                                .fontWeight(.medium)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(Color(.systemGray6))
                        .foregroundColor(.primary)
                        .cornerRadius(12)
                    }
                }
                .padding(.horizontal, 20)

                Spacer()

                // Footer
                Text("If you received an email from your dialysis social worker, tap 'Yes' to find your referral.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 30)
                    .padding(.bottom, 30)
            }
            .background(Color(.systemBackground))
        }
        .edgesIgnoringSafeArea(.top)
    }
}

#Preview {
    WereYouReferredView(
        showReferralFlow: .constant(true),
        wasReferred: .constant(nil)
    )
    .environmentObject(AppState())
}
