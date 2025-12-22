//
//  PatientProfileView.swift
//  Transplant Platform - Patient Mobile App
//
//  Patient profile management view with editable information
//

import SwiftUI

struct PatientProfileView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @StateObject private var viewModel = PatientProfileViewModel()
    @State private var showingLogoutAlert = false
    @State private var showingDeleteAccountAlert = false
    @State private var showingChangePassword = false
    @State private var showingConsentViewer = false
    @State private var selectedConsentType: String? = nil
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Profile Header
                    profileHeader
                    
                    // Personal Information Section
                    profileSection(title: "Personal Information", icon: "person.fill") {
                        personalInfoContent
                    }
                    
                    // Contact Information Section
                    profileSection(title: "Contact Information", icon: "phone.fill") {
                        contactInfoContent
                    }
                    
                    // Emergency Contact Section
                    profileSection(title: "Emergency Contact", icon: "exclamationmark.triangle.fill") {
                        emergencyContactContent
                    }
                    
                    // Physical Information Section
                    profileSection(title: "Physical Information", icon: "figure.stand") {
                        physicalInfoContent
                    }
                    
                    // Medical Providers Section
                    profileSection(title: "Medical Providers", icon: "stethoscope") {
                        medicalProvidersContent
                    }
                    
                    // Medical History Section
                    profileSection(title: "Medical History", icon: "heart.text.square.fill") {
                        medicalHistoryContent
                    }
                    
                    // Assigned Care Team Section
                    profileSection(title: "Care Team", icon: "person.2.fill") {
                        careTeamContent
                    }
                    
                    // Account Settings Section
                    profileSection(title: "Account Settings", icon: "gearshape.fill") {
                        accountSettingsContent
                    }
                    
                    // Logout Button
                    logoutButton
                    
                    Spacer(minLength: 40)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if viewModel.isEditing {
                        Button("Save") {
                            viewModel.saveProfile()
                        }
                        .fontWeight(.semibold)
                    } else {
                        Button("Edit") {
                            viewModel.isEditing = true
                        }
                    }
                }
                
                ToolbarItem(placement: .navigationBarLeading) {
                    if viewModel.isEditing {
                        Button("Cancel") {
                            viewModel.cancelEditing()
                        }
                    }
                }
            }
            .onAppear {
                viewModel.loadProfile()
            }
            .alert("Log Out", isPresented: $showingLogoutAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Log Out", role: .destructive) {
                    Task {
                        await authManager.signOut()
                    }
                }
            } message: {
                Text("Are you sure you want to log out?")
            }
            .alert("Delete Account", isPresented: $showingDeleteAccountAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Delete Account", role: .destructive) {
                    viewModel.deleteAccount()
                }
            } message: {
                Text("This action cannot be undone. All your data will be permanently deleted.")
            }
            .sheet(isPresented: $showingChangePassword) {
                ChangePasswordView()
            }
            .sheet(isPresented: $showingConsentViewer) {
                if let consentType = selectedConsentType {
                    ConsentDocumentViewer(consentType: consentType)
                }
            }
            .overlay {
                if viewModel.isLoading {
                    ProgressView()
                        .scaleEffect(1.5)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.opacity(0.2))
                }
            }
        }
    }
    
    // MARK: - Profile Header
    
    private var profileHeader: some View {
        VStack(spacing: 16) {
            // Avatar
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Color.blue.opacity(0.7), Color.purple.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 100, height: 100)
                
                Text(viewModel.initials)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.white)
            }
            
            // Name
            Text(viewModel.fullName)
                .font(.title2)
                .fontWeight(.bold)
            
            // Email
            Text(viewModel.email)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 20)
    }
    
    // MARK: - Personal Information
    
    private var personalInfoContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            ProfileField(
                label: "Full Name",
                value: $viewModel.fullName,
                isEditing: viewModel.isEditing
            )
            
            ProfileDateField(
                label: "Date of Birth",
                date: $viewModel.dateOfBirth,
                isEditing: viewModel.isEditing
            )
            
            ProfileField(
                label: "Address",
                value: $viewModel.address,
                isEditing: viewModel.isEditing,
                isMultiline: true
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - Contact Information
    
    private var contactInfoContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            ProfileField(
                label: "Email",
                value: $viewModel.email,
                isEditing: viewModel.isEditing,
                keyboardType: .emailAddress
            )
            
            ProfileField(
                label: "Phone",
                value: $viewModel.phone,
                isEditing: viewModel.isEditing,
                keyboardType: .phonePad
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - Emergency Contact
    
    private var emergencyContactContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            ProfileField(
                label: "Name",
                value: $viewModel.emergencyContactName,
                isEditing: viewModel.isEditing
            )
            
            ProfileField(
                label: "Relationship",
                value: $viewModel.emergencyContactRelationship,
                isEditing: viewModel.isEditing
            )
            
            ProfileField(
                label: "Phone",
                value: $viewModel.emergencyContactPhone,
                isEditing: viewModel.isEditing,
                keyboardType: .phonePad
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - Physical Information
    
    private var physicalInfoContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 16) {
                ProfileField(
                    label: "Height",
                    value: $viewModel.height,
                    isEditing: viewModel.isEditing
                )
                
                ProfileField(
                    label: "Weight (lbs)",
                    value: $viewModel.weight,
                    isEditing: viewModel.isEditing,
                    keyboardType: .numberPad
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - Medical Providers
    
    private var medicalProvidersContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            ProfileField(
                label: "Nephrologist",
                value: $viewModel.nephrologistName,
                isEditing: viewModel.isEditing
            )
            
            ProfileField(
                label: "Primary Care Physician",
                value: $viewModel.pcpName,
                isEditing: viewModel.isEditing
            )
            
            // Other Physicians
            if !viewModel.otherPhysicians.isEmpty || viewModel.isEditing {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Other Physicians")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .fontWeight(.medium)
                        
                        Spacer()
                        
                        if viewModel.isEditing {
                            Button {
                                viewModel.addPhysician()
                            } label: {
                                Image(systemName: "plus.circle.fill")
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                    
                    if viewModel.otherPhysicians.isEmpty && !viewModel.isEditing {
                        Text("None specified")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(viewModel.otherPhysicians.indices, id: \.self) { index in
                            PhysicianRow(
                                physician: $viewModel.otherPhysicians[index],
                                isEditing: viewModel.isEditing,
                                onDelete: {
                                    viewModel.removePhysician(at: index)
                                }
                            )
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - Medical History
    
    private var medicalHistoryContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Dialysis Status - Read Only
            ProfileDisplayField(
                label: "Dialysis Status",
                value: viewModel.onDialysis ? "On Dialysis: \(viewModel.dialysisType)" : "Not on dialysis",
                subtitle: viewModel.onDialysis && !viewModel.dialysisStartDate.isEmpty ? "Started: \(viewModel.dialysisStartDate)" : nil
            )
            
            // GFR - Editable
            ProfileField(
                label: "Last GFR",
                value: $viewModel.lastGFR,
                isEditing: viewModel.isEditing
            )
            
            // Diagnosed Conditions - Editable
            ProfileField(
                label: "Diagnosed Conditions",
                value: $viewModel.diagnosedConditions,
                isEditing: viewModel.isEditing,
                isMultiline: true
            )
            
            // Past Surgeries - Editable
            ProfileField(
                label: "Past Surgeries",
                value: $viewModel.pastSurgeries,
                isEditing: viewModel.isEditing,
                isMultiline: true
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - Care Team
    
    private var careTeamContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            // DUSW Social Worker
            VStack(alignment: .leading, spacing: 8) {
                Text("Assigned Social Worker")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fontWeight(.medium)
                
                if !viewModel.socialWorkerName.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(viewModel.socialWorkerName)
                        
                        if !viewModel.socialWorkerEmail.isEmpty {
                            HStack(spacing: 6) {
                                Image(systemName: "envelope")
                                    .font(.caption)
                                Text(viewModel.socialWorkerEmail)
                                    .font(.caption)
                            }
                            .foregroundColor(.secondary)
                        }
                        
                        if !viewModel.socialWorkerPhone.isEmpty {
                            HStack(spacing: 6) {
                                Image(systemName: "phone")
                                    .font(.caption)
                                Text(viewModel.socialWorkerPhone)
                                    .font(.caption)
                            }
                            .foregroundColor(.secondary)
                        }
                    }
                } else {
                    Text("Not assigned")
                        .foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            
            // Dialysis Clinic
            VStack(alignment: .leading, spacing: 8) {
                Text("Dialysis Clinic")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fontWeight(.medium)
                
                if !viewModel.dialysisClinicName.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(viewModel.dialysisClinicName)
                        
                        if !viewModel.dialysisClinicAddress.isEmpty {
                            Text(viewModel.dialysisClinicAddress)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                } else {
                    Text("Not specified")
                        .foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - Signed Documents
    
    private var signedDocumentsContent: some View {
        VStack(spacing: 12) {
            // Services Consent
            DocumentRow(
                title: "Services Consent",
                signedDate: viewModel.servicesConsentSignedAt,
                onView: {
                    selectedConsentType = "services_consent"
                    showingConsentViewer = true
                }
            )
            
            // Medical Records Consent
            DocumentRow(
                title: "Medical Records Authorization",
                signedDate: viewModel.medicalRecordsConsentSignedAt,
                onView: {
                    selectedConsentType = "medical_records_consent"
                    showingConsentViewer = true
                }
            )
            
            // Intake Form
            if viewModel.intakeFormSubmittedAt != nil {
                DocumentRow(
                    title: "Medical Intake Form",
                    signedDate: viewModel.intakeFormSubmittedAt,
                    onView: {
                        // TODO: View intake form
                    }
                )
            }
        }
    }
    
    // MARK: - Account Settings
    
    private var accountSettingsContent: some View {
        VStack(spacing: 12) {
            Button {
                showingChangePassword = true
            } label: {
                HStack {
                    Image(systemName: "lock.fill")
                        .foregroundColor(.blue)
                    Text("Change Password")
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
                showingDeleteAccountAlert = true
            } label: {
                HStack {
                    Image(systemName: "trash.fill")
                        .foregroundColor(.red)
                    Text("Delete Account")
                        .foregroundColor(.red)
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
    
    // MARK: - Logout Button
    
    private var logoutButton: some View {
        Button {
            showingLogoutAlert = true
        } label: {
            HStack {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                Text("Log Out")
            }
            .font(.headline)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.red)
            .cornerRadius(12)
        }
        .padding(.top, 20)
    }
    
    // MARK: - Section Builder
    
    private func profileSection<Content: View>(
        title: String,
        icon: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(.blue)
                Text(title)
                    .font(.headline)
            }
            
            VStack(alignment: .leading, spacing: 12) {
                content()
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.systemBackground))
            .cornerRadius(12)
        }
    }
}

// MARK: - Supporting Views

struct ProfileField: View {
    let label: String
    @Binding var value: String
    var isEditing: Bool
    var isMultiline: Bool = false
    var keyboardType: UIKeyboardType = .default
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .fontWeight(.medium)
            
            if isEditing {
                if isMultiline {
                    TextEditor(text: $value)
                        .frame(minHeight: 60)
                        .padding(4)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                } else {
                    TextField(label, text: $value)
                        .keyboardType(keyboardType)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }
            } else {
                Text(value.isEmpty ? "Not specified" : value)
                    .foregroundColor(value.isEmpty ? .secondary : .primary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ProfileDateField: View {
    let label: String
    @Binding var date: Date?
    var isEditing: Bool
    
    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        return formatter
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .fontWeight(.medium)
            
            if isEditing {
                DatePicker(
                    label,
                    selection: Binding(
                        get: { date ?? Date() },
                        set: { date = $0 }
                    ),
                    displayedComponents: .date
                )
                .labelsHidden()
            } else {
                if let date = date {
                    Text(dateFormatter.string(from: date))
                } else {
                    Text("Not specified")
                        .foregroundColor(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ProfileDisplayField: View {
    let label: String
    let value: String
    var subtitle: String? = nil
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .fontWeight(.medium)
            
            Text(value)
                .foregroundColor(value.contains("Not") || value.contains("None") ? .secondary : .primary)
            
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PhysicianRow: View {
    @Binding var physician: ProfilePhysician
    var isEditing: Bool
    var onDelete: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if isEditing {
                    TextField("Name", text: $physician.name)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                } else {
                    Text(physician.name)
                        .fontWeight(.medium)
                }
                
                Spacer()
                
                if isEditing {
                    Button(action: onDelete) {
                        Image(systemName: "minus.circle.fill")
                            .foregroundColor(.red)
                    }
                }
            }
            
            if isEditing {
                TextField("Specialty", text: $physician.specialty)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .font(.caption)
            } else if !physician.specialty.isEmpty {
                Text(physician.specialty)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

struct DocumentRow: View {
    let title: String
    let signedDate: Date?
    let onView: () -> Void
    
    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .fontWeight(.medium)
                
                if let date = signedDate {
                    Text("Signed: \(dateFormatter.string(from: date))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else {
                    Text("Not signed")
                        .font(.caption)
                        .foregroundColor(.orange)
                }
            }
            
            Spacer()
            
            if signedDate != nil {
                Button("View") {
                    onView()
                }
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.blue)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(10)
    }
}

// MARK: - Change Password View

struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showSuccess = false
    
    var body: some View {
        NavigationView {
            Form {
                Section {
                    SecureField("Current Password", text: $currentPassword)
                    SecureField("New Password", text: $newPassword)
                    SecureField("Confirm New Password", text: $confirmPassword)
                }
                
                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                    }
                }
                
                Section {
                    Button {
                        changePassword()
                    } label: {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("Change Password")
                        }
                    }
                    .disabled(isLoading || currentPassword.isEmpty || newPassword.isEmpty || confirmPassword.isEmpty)
                }
            }
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .alert("Password Changed", isPresented: $showSuccess) {
                Button("OK") {
                    dismiss()
                }
            } message: {
                Text("Your password has been successfully changed.")
            }
        }
    }
    
    private func changePassword() {
        guard newPassword == confirmPassword else {
            errorMessage = "New passwords do not match"
            return
        }
        
        guard newPassword.count >= 8 else {
            errorMessage = "Password must be at least 8 characters"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        // TODO: Implement password change API call
        Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            await MainActor.run {
                isLoading = false
                showSuccess = true
            }
        }
    }
}

// MARK: - Consent Document Viewer

struct ConsentDocumentViewer: View {
    let consentType: String
    @Environment(\.dismiss) private var dismiss
    @State private var pdfData: Data?
    @State private var isLoading = true
    @State private var errorMessage: String?
    
    var title: String {
        switch consentType {
        case "services_consent":
            return "Services Consent"
        case "medical_records_consent":
            return "Medical Records Authorization"
        default:
            return "Document"
        }
    }
    
    var body: some View {
        NavigationView {
            Group {
                if isLoading {
                    VStack {
                        ProgressView()
                        Text("Loading document...")
                            .foregroundColor(.secondary)
                            .padding(.top)
                    }
                } else if let error = errorMessage {
                    VStack {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle)
                            .foregroundColor(.orange)
                        Text(error)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding()
                    }
                } else if let data = pdfData {
                    PDFViewer(data: data)
                } else {
                    Text("Document not available")
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                loadDocument()
            }
        }
    }
    
    private func loadDocument() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else {
            errorMessage = "Authentication required"
            isLoading = false
            return
        }
        
        Task {
            do {
                let data = try await APIService.shared.getConsentPDF(
                    consentType: consentType,
                    accessToken: accessToken
                )
                await MainActor.run {
                    pdfData = data
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to load document"
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - PDF Viewer

struct PDFViewer: UIViewRepresentable {
    let data: Data
    
    func makeUIView(context: Context) -> UIView {
        let pdfView = UIView()
        // TODO: Implement proper PDF viewing with PDFKit
        return pdfView
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        // Update view
    }
}

#Preview {
    PatientProfileView()
        .environmentObject(AuthenticationManager())
}