//
//  HelpSupportView.swift
//  Transplant Platform - Patient Mobile App
//
//  Help and support with FAQ, contact info, and messaging
//

import SwiftUI
import MessageUI

struct HelpSupportView: View {
    @State private var expandedFAQ: String? = nil
    @State private var showingEmailComposer = false
    @State private var showingMessageSocialWorker = false
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Contact Section
                    contactSection
                    
                    // FAQ Section
                    faqSection
                    
                    // Message Social Worker
                    messageSocialWorkerSection
                    
                    // App Info
                    appInfoSection
                    
                    Spacer(minLength: 40)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Help & Support")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingMessageSocialWorker) {
                MessageSocialWorkerView()
            }
        }
    }
    
    // MARK: - Contact Section
    
    private var contactSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "headphones")
                    .foregroundColor(.blue)
                Text("Contact Us")
                    .font(.headline)
            }
            
            VStack(spacing: 12) {
                // Email
                Button {
                    if let url = URL(string: "mailto:support@transplantwizard.com") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack {
                        Image(systemName: "envelope.fill")
                            .foregroundColor(.blue)
                            .frame(width: 30)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Email Support")
                                .fontWeight(.medium)
                                .foregroundColor(.primary)
                            Text("support@transplantwizard.com")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        Image(systemName: "chevron.right")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                    .padding()
                    .background(Color(.systemBackground))
                    .cornerRadius(10)
                }
                
                // Phone
                Button {
                    if let url = URL(string: "tel://3132687038") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack {
                        Image(systemName: "phone.fill")
                            .foregroundColor(.green)
                            .frame(width: 30)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Call Support")
                                .fontWeight(.medium)
                                .foregroundColor(.primary)
                            Text("(313) 268-7038")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        Image(systemName: "chevron.right")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                    .padding()
                    .background(Color(.systemBackground))
                    .cornerRadius(10)
                }
            }
        }
    }
    
    // MARK: - FAQ Section
    
    private var faqSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "questionmark.circle.fill")
                    .foregroundColor(.orange)
                Text("Frequently Asked Questions")
                    .font(.headline)
            }
            
            VStack(spacing: 8) {
                ForEach(faqItems, id: \.question) { item in
                    FAQRow(
                        question: item.question,
                        answer: item.answer,
                        isExpanded: expandedFAQ == item.question,
                        onTap: {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                if expandedFAQ == item.question {
                                    expandedFAQ = nil
                                } else {
                                    expandedFAQ = item.question
                                }
                            }
                        }
                    )
                }
            }
        }
    }
    
    // MARK: - Message Social Worker Section
    
    private var messageSocialWorkerSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "message.fill")
                    .foregroundColor(.purple)
                Text("Message Your Social Worker")
                    .font(.headline)
            }
            
            Button {
                showingMessageSocialWorker = true
            } label: {
                HStack {
                    Image(systemName: "person.crop.circle.badge.checkmark")
                        .foregroundColor(.purple)
                        .font(.title2)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Contact Your DUSW")
                            .fontWeight(.medium)
                            .foregroundColor(.primary)
                        Text("Send a message to your assigned social worker")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                    
                    Image(systemName: "chevron.right")
                        .foregroundColor(.secondary)
                        .font(.caption)
                }
                .padding()
                .background(Color(.systemBackground))
                .cornerRadius(10)
            }
        }
    }
    
    // MARK: - App Info Section
    
    private var appInfoSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "info.circle.fill")
                    .foregroundColor(.gray)
                Text("About")
                    .font(.headline)
            }
            
            VStack(spacing: 12) {
                HStack {
                    Text("App Version")
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("1.0.0")
                        .fontWeight(.medium)
                }
                .padding()
                .background(Color(.systemBackground))
                .cornerRadius(10)
                
                Button {
                    if let url = URL(string: "https://transplantwizard.com/privacy") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack {
                        Text("Privacy Policy")
                            .foregroundColor(.primary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                    .padding()
                    .background(Color(.systemBackground))
                    .cornerRadius(10)
                }
                
                Button {
                    if let url = URL(string: "https://transplantwizard.com/terms") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack {
                        Text("Terms of Service")
                            .foregroundColor(.primary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                    .padding()
                    .background(Color(.systemBackground))
                    .cornerRadius(10)
                }
            }
        }
    }
    
    // MARK: - FAQ Data
    
    private var faqItems: [(question: String, answer: String)] {
        [
            (
                question: "What is Transplant Wizard?",
                answer: "Transplant Wizard is a platform that helps kidney dialysis patients navigate the transplant process. We connect you with transplant centers, help you manage your medical documents, and provide support throughout your transplant journey."
            ),
            (
                question: "How do I apply to a transplant center?",
                answer: "Go to the 'Centers' tab in the app, tap 'Add Transplant Center', search for centers in your area, and tap the + button to apply. The center will be notified of your application."
            ),
            (
                question: "What documents do I need to upload?",
                answer: "Common documents include: medical records, lab results, insurance information, identification documents, and any referral letters from your doctors. Check with each transplant center for their specific requirements."
            ),
            (
                question: "How long does the transplant evaluation process take?",
                answer: "The evaluation process varies by center but typically takes 2-6 months. This includes medical tests, meetings with the transplant team, and review by the selection committee."
            ),
            (
                question: "Can I apply to multiple transplant centers?",
                answer: "Yes! We encourage patients to apply to multiple centers to increase their chances. You can manage all your applications through the app."
            ),
            (
                question: "Who is my assigned social worker?",
                answer: "Your dialysis unit social worker (DUSW) is assigned based on your dialysis clinic. You can view their contact information in your Profile and message them directly through the app."
            ),
            (
                question: "Is my medical information secure?",
                answer: "Yes. Transplant Wizard is HIPAA-compliant and uses encryption to protect your health information. Only authorized healthcare providers and your care team can access your data."
            ),
            (
                question: "How do I update my medical information?",
                answer: "Go to the 'Profile' tab to update your personal and medical information. Some fields may require verification by your healthcare provider."
            )
        ]
    }
}

// MARK: - FAQ Row

struct FAQRow: View {
    let question: String
    let answer: String
    let isExpanded: Bool
    let onTap: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onTap) {
                HStack {
                    Text(question)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                        .multilineTextAlignment(.leading)
                    
                    Spacer()
                    
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.secondary)
                        .font(.caption)
                }
                .padding()
            }
            
            if isExpanded {
                Text(answer)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.horizontal)
                    .padding(.bottom)
            }
        }
        .background(Color(.systemBackground))
        .cornerRadius(10)
    }
}

// MARK: - Message Social Worker View

struct MessageSocialWorkerView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var messageText = ""
    @State private var isLoading = false
    @State private var showSuccess = false
    @State private var socialWorkerName = ""
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Social Worker Info
                VStack(spacing: 8) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.purple.opacity(0.7))
                    
                    Text(socialWorkerName.isEmpty ? "Your Social Worker" : socialWorkerName)
                        .font(.title3)
                        .fontWeight(.semibold)
                    
                    Text("Send a message to your assigned DUSW")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 20)
                
                // Message Input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Message")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .fontWeight(.medium)
                    
                    TextEditor(text: $messageText)
                        .frame(minHeight: 150)
                        .padding(8)
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                }
                .padding(.horizontal)
                
                // Send Button
                Button {
                    sendMessage()
                } label: {
                    if isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        HStack {
                            Image(systemName: "paperplane.fill")
                            Text("Send Message")
                        }
                    }
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(messageText.isEmpty ? Color.gray : Color.purple)
                .cornerRadius(12)
                .disabled(messageText.isEmpty || isLoading)
                .padding(.horizontal)
                
                Spacer()
            }
            .navigationTitle("Message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                loadSocialWorkerInfo()
            }
            .alert("Message Sent", isPresented: $showSuccess) {
                Button("OK") {
                    dismiss()
                }
            } message: {
                Text("Your message has been sent to your social worker.")
            }
        }
    }
    
    private func loadSocialWorkerInfo() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        Task {
            do {
                let profile = try await APIService.shared.getPatientProfile(accessToken: accessToken)
                await MainActor.run {
                    socialWorkerName = profile.socialWorkerName ?? ""
                }
            } catch {
                print("❌ Error loading social worker info: \(error)")
            }
        }
    }
    
    private func sendMessage() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                _ = try await APIService.shared.sendMessageToSocialWorker(
                    message: messageText,
                    accessToken: accessToken
                )
                await MainActor.run {
                    isLoading = false
                    showSuccess = true
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    print("❌ Error sending message: \(error)")
                }
            }
        }
    }
}

#Preview {
    HelpSupportView()
}