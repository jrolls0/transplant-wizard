//
//  RegistrationView.swift
//  Transplant Platform - Patient Mobile App
//
//  Complete patient registration form with HIPAA compliance
//

import SwiftUI

struct RegistrationView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @EnvironmentObject private var appState: AppState
    @Binding var selectedTab: AuthTab
    
    // Form fields
    @State private var title = ""
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var phoneNumber = ""
    @State private var dateOfBirth = Date()
    @State private var address = ""
    @State private var primaryCarePhysician = ""
    @State private var insuranceProvider = ""
    @State private var nephrologist = ""

    // Referral information
    @State private var referralToken: String?
    @State private var isPrefilledFromReferral = false

    // UI state
    @State private var showDatePicker = false
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var showingVerification = false
    @State private var selectedTitle = 0
    
    // Form validation
    @State private var fieldErrors: [String: String] = [:]
    
    private let titles = ["", "Mr.", "Mrs.", "Ms.", "Dr.", "Prof."]
    // Dialysis clinic and social worker selection
    @State private var selectedDialysisClinic = 0
    @State private var selectedSocialWorker = 0
    
    @State private var dialysisClinics: [String] = [""]
    @State private var socialWorkers: [String: [SocialWorker]] = [:]
    @State private var isLoadingSocialWorkers = false
    
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    headerSection
                    
                    // Personal Information Section
                    personalInfoSection
                    
                    // Contact Information Section  
                    contactInfoSection
                    
                    // Medical Information Section (optional)
                    medicalInfoSection
                    
                    // Account Security Section
                    securitySection
                    
                    // Register Button
                    registerButton
                    
                    // Terms and Privacy
                    termsSection
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .alert("Registration Error", isPresented: .constant(!errorMessage.isEmpty)) {
            Button("OK") { 
                errorMessage = ""
                fieldErrors.removeAll()
            }
        } message: {
            Text(errorMessage)
        }
        .onTapGesture {
            hideKeyboard()
        }
        .onAppear {
            loadSocialWorkers()
            prePopulateFromReferral()
        }
    }
    
    // MARK: - View Sections
    
    private var headerSection: some View {
        VStack(spacing: 8) {
            Text("Create Your Account")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.primary)
            
            Text("Join our HIPAA-compliant transplant platform")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 20)
    }
    
    private var personalInfoSection: some View {
        FormSection(title: "Personal Information", icon: "person.fill") {
            // Title selection
            VStack(alignment: .leading, spacing: 8) {
                Text("Title")
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                Picker("Title", selection: $selectedTitle) {
                    ForEach(titles.indices, id: \.self) { index in
                        Text(titles[index]).tag(index)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }
            
            // First Name
            FormField(
                title: "First Name *",
                text: $firstName,
                placeholder: "Enter your first name",
                keyboardType: .default,
                errorMessage: fieldErrors["firstName"]
            )
            
            // Last Name
            FormField(
                title: "Last Name *",
                text: $lastName,
                placeholder: "Enter your last name", 
                keyboardType: .default,
                errorMessage: fieldErrors["lastName"]
            )
            
            // Date of Birth
            VStack(alignment: .leading, spacing: 8) {
                Text("Date of Birth")
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                Button(action: { showDatePicker.toggle() }) {
                    HStack {
                        Text(dateOfBirth.formatted(date: .abbreviated, time: .omitted))
                            .foregroundColor(.primary)
                        Spacer()
                        Image(systemName: "calendar")
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                }
                .sheet(isPresented: $showDatePicker) {
                    DatePickerSheet(selectedDate: $dateOfBirth)
                }
            }
        }
    }
    
    private var contactInfoSection: some View {
        FormSection(title: "Contact Information", icon: "phone.fill") {
            // Email
            FormField(
                title: "Email Address *",
                text: $email,
                placeholder: "Enter your email address",
                keyboardType: .emailAddress,
                errorMessage: fieldErrors["email"]
            )
            
            // Phone Number
            FormField(
                title: "Phone Number",
                text: $phoneNumber,
                placeholder: "+1 (555) 123-4567",
                keyboardType: .phonePad,
                errorMessage: fieldErrors["phoneNumber"]
            )
            
            // Address
            FormField(
                title: "Address",
                text: $address,
                placeholder: "Enter your home address",
                keyboardType: .default,
                isMultiline: true,
                errorMessage: fieldErrors["address"]
            )
        }
    }
    
    private var medicalInfoSection: some View {
        FormSection(title: "Medical Information (Optional)", icon: "cross.fill") {
            // Primary Care Physician
            FormField(
                title: "Primary Care Physician",
                text: $primaryCarePhysician,
                placeholder: "Dr. John Smith",
                keyboardType: .default,
                errorMessage: fieldErrors["primaryCarePhysician"]
            )
            
            // Insurance Provider
            FormField(
                title: "Insurance Provider",
                text: $insuranceProvider,
                placeholder: "Blue Cross Blue Shield",
                keyboardType: .default,
                errorMessage: fieldErrors["insuranceProvider"]
            )

            // Nephrologist
            FormField(
                title: "Nephrologist",
                text: $nephrologist,
                placeholder: "Dr. Jane Doe",
                keyboardType: .default,
                errorMessage: fieldErrors["nephrologist"]
            )

            // Dialysis Clinic Selection
            VStack(alignment: .leading, spacing: 8) {
                Text("Dialysis Clinic *")
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                Picker("Dialysis Clinic", selection: $selectedDialysisClinic) {
                    ForEach(dialysisClinics.indices, id: \.self) { index in
                        Text(dialysisClinics[index].isEmpty ? "Select your dialysis clinic" : dialysisClinics[index])
                            .tag(index)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray6))
                .cornerRadius(8)
                
                if let error = fieldErrors["dialysisClinic"] {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }
            
            // Social Worker Selection
            if selectedDialysisClinic > 0 {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Assigned Social Worker *")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    
                    let clinicName = dialysisClinics[selectedDialysisClinic]
                    let availableWorkers = socialWorkers[clinicName] ?? []
                    
                    if isLoadingSocialWorkers {
                        HStack {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("Loading social workers...")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                    } else {
                        Picker("Social Worker", selection: $selectedSocialWorker) {
                            Text("Select your social worker").tag(0)
                            ForEach(availableWorkers.indices, id: \.self) { index in
                                Text(availableWorkers[index].fullName).tag(index + 1)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                        .onChange(of: selectedDialysisClinic) { _ in
                            selectedSocialWorker = 0 // Reset social worker when clinic changes
                        }
                    }
                    
                    if let error = fieldErrors["socialWorker"] {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
            }
        }
    }
    
    private var securitySection: some View {
        FormSection(title: "Account Security", icon: "lock.fill") {
            // Password
            SecureFormField(
                title: "Password *",
                text: $password,
                placeholder: "Create a secure password",
                errorMessage: fieldErrors["password"]
            )
            
            // Confirm Password
            SecureFormField(
                title: "Confirm Password *",
                text: $confirmPassword,
                placeholder: "Confirm your password",
                errorMessage: fieldErrors["confirmPassword"]
            )
            
            // Password requirements
            VStack(alignment: .leading, spacing: 4) {
                Text("Password Requirements:")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.secondary)
                
                passwordRequirement("At least 8 characters", met: password.count >= 8)
                passwordRequirement("Uppercase letter", met: password.rangeOfCharacter(from: .uppercaseLetters) != nil)
                passwordRequirement("Lowercase letter", met: password.rangeOfCharacter(from: .lowercaseLetters) != nil)
                passwordRequirement("Number", met: password.rangeOfCharacter(from: .decimalDigits) != nil)
                passwordRequirement("Special character (!@#$%^&*)", met: password.rangeOfCharacter(from: CharacterSet(charactersIn: "!@#$%^&*()_+-=[]{}|;:,.<>?")) != nil)
            }
            .padding(.top, 8)
        }
    }
    
    private var registerButton: some View {
        Button(action: handleRegistration) {
            HStack {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.8)
                } else {
                    Text("Create Account")
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                LinearGradient(
                    colors: [Color(red: 0.2, green: 0.6, blue: 0.9), Color(red: 0.1, green: 0.5, blue: 0.8)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .foregroundColor(.white)
            .cornerRadius(12)
            .disabled(isLoading)
        }
        .padding(.top, 16)
    }
    
    private var termsSection: some View {
        VStack(spacing: 8) {
            Text("By creating an account, you agree to our")
                .font(.caption)
                .foregroundColor(.secondary)
            
            HStack(spacing: 4) {
                Button("Terms of Service") {
                    // Handle terms tap
                }
                .font(.caption)
                .foregroundColor(.blue)
                
                Text("and")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Button("Privacy Policy") {
                    // Handle privacy tap
                }
                .font(.caption)
                .foregroundColor(.blue)
            }
            
            Text("🔒 Your data is HIPAA compliant and secure")
                .font(.caption2)
                .foregroundColor(.green)
                .padding(.top, 8)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 20)
    }
    
    // MARK: - Helper Methods
    
    private func passwordRequirement(_ text: String, met: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .foregroundColor(met ? .green : .secondary)
                .font(.caption)
            
            Text(text)
                .font(.caption)
                .foregroundColor(met ? .green : .secondary)
        }
    }
    
    private func validateForm() -> Bool {
        fieldErrors.removeAll()
        var isValid = true
        
        // Required field validation
        if firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            fieldErrors["firstName"] = "First name is required"
            isValid = false
        }
        
        if lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            fieldErrors["lastName"] = "Last name is required"
            isValid = false
        }
        
        if email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            fieldErrors["email"] = "Email address is required"
            isValid = false
        } else if !isValidEmail(email) {
            fieldErrors["email"] = "Please enter a valid email address"
            isValid = false
        }
        
        if password.isEmpty {
            fieldErrors["password"] = "Password is required"
            isValid = false
        } else if !isValidPassword(password) {
            fieldErrors["password"] = "Password must meet all requirements"
            isValid = false
        }
        
        if confirmPassword != password {
            fieldErrors["confirmPassword"] = "Passwords do not match"
            isValid = false
        }
        
        // Dialysis clinic validation
        if selectedDialysisClinic == 0 {
            fieldErrors["dialysisClinic"] = "Please select your dialysis clinic"
            isValid = false
        }
        
        // Social worker validation
        if selectedDialysisClinic > 0 && selectedSocialWorker == 0 {
            fieldErrors["socialWorker"] = "Please select your assigned social worker"
            isValid = false
        }
        
        return isValid
    }
    
    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return NSPredicate(format: "SELF MATCHES %@", emailRegex).evaluate(with: email)
    }
    
    private func isValidPassword(_ password: String) -> Bool {
        let hasMinLength = password.count >= 8
        let hasUppercase = password.rangeOfCharacter(from: .uppercaseLetters) != nil
        let hasLowercase = password.rangeOfCharacter(from: .lowercaseLetters) != nil
        let hasNumber = password.rangeOfCharacter(from: .decimalDigits) != nil
        let hasSymbol = password.rangeOfCharacter(from: CharacterSet(charactersIn: "!@#$%^&*()_+-=[]{}|;:,.<>?")) != nil
        
        return hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSymbol
    }
    
    private func handleRegistration() {
        hideKeyboard()
        
        guard validateForm() else {
            errorMessage = "Please correct the errors below"
            HapticManager.shared.error()
            return
        }
        
        isLoading = true
        
        // Get selected clinic and social worker names
        let selectedClinicName = selectedDialysisClinic > 0 ? dialysisClinics[selectedDialysisClinic] : ""
        let selectedWorkerName: String = {
            if selectedDialysisClinic > 0 && selectedSocialWorker > 0 {
                let clinicName = dialysisClinics[selectedDialysisClinic]
                let workers = socialWorkers[clinicName] ?? []
                return selectedSocialWorker <= workers.count ? workers[selectedSocialWorker - 1].fullName : ""
            }
            return ""
        }()
        
        // Format phone number to E.164 format if provided
        let formattedPhone: String? = {
            if phoneNumber.isEmpty { return nil }
            let digits = phoneNumber.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
            if digits.count == 10 {
                return "+1" + digits
            } else if digits.count == 11 && digits.hasPrefix("1") {
                return "+" + digits
            } else if phoneNumber.hasPrefix("+") {
                return phoneNumber
            } else {
                return phoneNumber
            }
        }()
        
        let registrationData = PatientRegistrationData(
            title: selectedTitle > 0 ? titles[selectedTitle] : nil,
            firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
            lastName: lastName.trimmingCharacters(in: .whitespacesAndNewlines),
            phoneNumber: formattedPhone,
            dateOfBirth: dateOfBirth,
            address: address.isEmpty ? nil : address,
            primaryCarePhysician: primaryCarePhysician.isEmpty ? nil : primaryCarePhysician,
            insuranceProvider: insuranceProvider.isEmpty ? nil : insuranceProvider,
            nephrologist: nephrologist.isEmpty ? nil : nephrologist,
            dialysisClinic: selectedClinicName,
            socialWorkerName: selectedWorkerName,
            referralToken: referralToken
        )
        
        Task {
            let success = await authManager.signUp(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password,
                profile: registrationData
            )
            
            await MainActor.run {
                isLoading = false
                
                if success {
                    HapticManager.shared.success()
                    // Since we're using basic authentication, switch to login tab
                    // No email verification needed
                    withAnimation(.easeInOut(duration: 0.3)) {
                        selectedTab = .login
                    }
                    
                    // Clear form fields after successful registration
                    clearForm()
                } else {
                    HapticManager.shared.error()
                    errorMessage = authManager.authError ?? "Registration failed. Please try again."
                }
            }
        }
    }
    
    private func clearForm() {
        title = ""
        firstName = ""
        lastName = ""
        email = ""
        password = ""
        confirmPassword = ""
        phoneNumber = ""
        dateOfBirth = Date()
        address = ""
        primaryCarePhysician = ""
        insuranceProvider = ""
        selectedTitle = 0
        selectedDialysisClinic = 0
        selectedSocialWorker = 0
        fieldErrors.removeAll()
    }
    
    private func loadSocialWorkers() {
        guard socialWorkers.isEmpty else { return } // Don't reload if already loaded
        
        isLoadingSocialWorkers = true
        
        Task {
            do {
                let response = try await APIService.shared.fetchSocialWorkers()
                
                await MainActor.run {
                    self.socialWorkers = response.data
                    
                    // Update dialysis clinics array with available clinics
                    let availableClinics = Array(response.data.keys).sorted()
                    self.dialysisClinics = [""] + availableClinics
                    
                    print("✅ Successfully loaded \(availableClinics.count) dialysis clinics")
                    print("📋 Clinics: \(availableClinics)")
                    
                    self.isLoadingSocialWorkers = false
                }
            } catch {
                await MainActor.run {
                    self.isLoadingSocialWorkers = false
                    // Handle error - user can still select clinic but won't see social workers
                    print("❌ Failed to load social workers: \(error)")
                    // For debugging - show some default clinics if API fails
                    self.dialysisClinics = [
                        "",
                        "Metro Health Dialysis Center",
                        "Lakeside Renal Unit", 
                        "Grand River Kidney Care",
                        "University Hospital Dialysis",
                        "Community Dialysis Center",
                        "Regional Kidney Care"
                    ]
                }
            }
        }
    }
    
    private func hideKeyboard() {
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
    }
}

// MARK: - Supporting Views

struct FormSection<Content: View>: View {
    let title: String
    let icon: String
    let content: Content
    
    init(title: String, icon: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.icon = icon
        self.content = content()
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                    .font(.system(size: 16, weight: .medium))
                
                Text(title)
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
            }
            
            VStack(spacing: 12) {
                content
            }
        }
        .padding(16)
        .background(Color.white)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
    }
}

struct FormField: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    var keyboardType: UIKeyboardType = .default
    var isMultiline: Bool = false
    var errorMessage: String?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.medium)
            
            if isMultiline {
                TextEditor(text: $text)
                    .frame(minHeight: 80)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
            } else {
                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .autocapitalization(keyboardType == .emailAddress ? .none : .words)
                    .autocorrectionDisabled(keyboardType == .emailAddress)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
            }
            
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

struct SecureFormField: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    var errorMessage: String?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.medium)
            
            SecureField(placeholder, text: $text)
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .background(Color(.systemGray6))
                .cornerRadius(8)
            
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

struct DatePickerSheet: View {
    @Binding var selectedDate: Date
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                DatePicker(
                    "Select Date of Birth",
                    selection: $selectedDate,
                    in: ...Date(),
                    displayedComponents: .date
                )
                .datePickerStyle(.wheel)
                .padding()
                
                Spacer()
            }
            .navigationTitle("Date of Birth")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Email Verification View

struct EmailVerificationView: View {
    let email: String
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authManager: AuthenticationManager
    
    @State private var verificationCode = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                VStack(spacing: 16) {
                    Image(systemName: "envelope.circle.fill")
                        .font(.system(size: 80))
                        .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                    
                    Text("Verify Your Email")
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    Text("We've sent a verification code to:")
                        .font(.body)
                        .foregroundColor(.secondary)
                    
                    Text(email)
                        .font(.body)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                }
                .padding(.top, 40)
                
                VStack(spacing: 16) {
                    TextField("Enter verification code", text: $verificationCode)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.center)
                        .font(.title3)
                    
                    Button(action: handleVerification) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            } else {
                                Text("Verify Email")
                                    .fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color(red: 0.2, green: 0.6, blue: 0.9))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(isLoading || verificationCode.isEmpty)
                }
                .padding(.horizontal, 40)
                
                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal, 40)
                }
                
                Spacer()
            }
            .navigationTitle("Email Verification")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
    
    private func handleVerification() {
        isLoading = true
        errorMessage = ""

        Task {
            let success = await authManager.verifyEmail(email: email, code: verificationCode)

            await MainActor.run {
                isLoading = false

                if success {
                    HapticManager.shared.success()
                    dismiss()
                } else {
                    HapticManager.shared.error()
                    errorMessage = authManager.authError ?? "Verification failed. Please try again."
                }
            }
        }
    }

    private func prePopulateFromReferral() {
        // Pre-fill form fields from referral data passed via deep link
        guard !appState.referralData.isEmpty else {
            print("ℹ️ No referral data found - standard registration")
            return
        }

        print("🔗 Pre-populating form from referral data")
        isPrefilledFromReferral = true

        // Pre-fill text fields
        if let firstName = appState.referralData["firstName"], !firstName.isEmpty {
            self.firstName = firstName
        }

        if let lastName = appState.referralData["lastName"], !lastName.isEmpty {
            self.lastName = lastName
        }

        if let email = appState.referralData["email"], !email.isEmpty {
            self.email = email
        }

        if let title = appState.referralData["title"], !title.isEmpty {
            // Find matching title in the titles array
            if let index = titles.firstIndex(of: title) {
                selectedTitle = index
                self.title = title
            }
        }

        if let nephrologist = appState.referralData["nephrologist"], !nephrologist.isEmpty {
            self.nephrologist = nephrologist
        }

        // Pre-fill referral token for backend
        if let referralToken = appState.referralData["referralToken"] {
            self.referralToken = referralToken
            print("✅ Referral token loaded: \(referralToken)")
        }

        // Pre-select dialysis clinic if available
        if let dialysisClinic = appState.referralData["dialysisClinic"], !dialysisClinic.isEmpty {
            print("📍 Pre-filled dialysis clinic: \(dialysisClinic)")
            // The dialysis clinic will be set when it's available from social workers API
            // For now, we just log that it's available
        }

        // Pre-select social worker if available
        if let dusw = appState.referralData["dusw"], !dusw.isEmpty {
            print("👤 Pre-filled DUSW name: \(dusw)")
        }

        print("✅ Form pre-population complete")
    }
}

#Preview {
    RegistrationView(selectedTab: .constant(.register))
        .environmentObject(AuthenticationManager())
        .environmentObject(AppState())
}