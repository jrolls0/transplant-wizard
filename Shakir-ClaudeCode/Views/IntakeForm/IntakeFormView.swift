//
//  IntakeFormView.swift
//  Transplant Platform - Patient Mobile App
//
//  Medical intake form for patients
//

import SwiftUI

struct IntakeFormView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = IntakeFormViewModel()
    @State private var currentSection = 0
    @State private var showSignaturePad = false
    @State private var showSubmitConfirmation = false
    
    let sections = ["Demographics", "Basic Info", "Contraindications", "Medical History", "Providers", "Signature"]
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Progress indicator
                progressHeader
                
                // Form content
                TabView(selection: $currentSection) {
                    demographicsSection.tag(0)
                    basicInfoSection.tag(1)
                    contraindicationsSection.tag(2)
                    medicalHistorySection.tag(3)
                    providersSection.tag(4)
                    signatureSection.tag(5)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: currentSection)
                
                // Navigation buttons
                navigationButtons
            }
            .navigationTitle("Intake Form")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Save & Exit") {
                        viewModel.saveForm()
                        dismiss()
                    }
                }
            }
            .onAppear {
                viewModel.loadForm()
            }
            .alert("Submit Form", isPresented: $showSubmitConfirmation) {
                Button("Cancel", role: .cancel) { }
                Button("Submit") {
                    viewModel.submitForm()
                }
            } message: {
                Text("Are you sure you want to submit your intake form? You can still edit it after submission.")
            }
            .overlay {
                if viewModel.isLoading {
                    LoadingOverlay()
                }
            }
            .alert("Success", isPresented: $viewModel.showSuccessAlert) {
                Button("OK") { dismiss() }
            } message: {
                Text("Your intake form has been submitted successfully!")
            }
        }
    }
    
    // MARK: - Progress Header
    
    private var progressHeader: some View {
        VStack(spacing: 8) {
            // Section tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(0..<sections.count, id: \.self) { index in
                        Button(action: { currentSection = index }) {
                            Text(sections[index])
                                .font(.caption)
                                .fontWeight(currentSection == index ? .bold : .regular)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(
                                    currentSection == index ?
                                    Color(red: 0.2, green: 0.6, blue: 0.9) :
                                    Color(.systemGray5)
                                )
                                .foregroundColor(currentSection == index ? .white : .primary)
                                .cornerRadius(16)
                        }
                    }
                }
                .padding(.horizontal)
            }
            
            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .frame(height: 4)
                    
                    Rectangle()
                        .fill(Color(red: 0.2, green: 0.6, blue: 0.9))
                        .frame(width: geometry.size.width * CGFloat(currentSection + 1) / CGFloat(sections.count), height: 4)
                }
            }
            .frame(height: 4)
            .padding(.horizontal)
        }
        .padding(.vertical, 12)
        .background(Color(.systemBackground))
    }
    
    // MARK: - Demographics Section
    
    private var demographicsSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                sectionHeader(title: "Patient Demographics", icon: "person.fill")
                
                RequiredTextField(title: "Full Name", text: $viewModel.fullName, isRequired: true)
                
                DatePickerField(title: "Date of Birth", date: $viewModel.dateOfBirth, isRequired: true)
                
                RequiredTextField(title: "Address", text: $viewModel.address, isRequired: true)
                
                RequiredTextField(title: "Phone", text: $viewModel.phone, isRequired: true, keyboardType: .phonePad)
                
                RequiredTextField(title: "Email", text: $viewModel.email, isRequired: true, keyboardType: .emailAddress)
                
                Divider().padding(.vertical, 8)
                
                Text("Emergency Contact")
                    .font(.headline)
                    .foregroundColor(.secondary)
                
                RequiredTextField(title: "Name", text: $viewModel.emergencyContactName, isRequired: true)
                
                RequiredTextField(title: "Relationship", text: $viewModel.emergencyContactRelationship, isRequired: true)
                
                RequiredTextField(title: "Phone", text: $viewModel.emergencyContactPhone, isRequired: true, keyboardType: .phonePad)
                
                Divider().padding(.vertical, 8)
                
                Text("Social Support Person (if different)")
                    .font(.headline)
                    .foregroundColor(.secondary)
                
                RequiredTextField(title: "Name", text: $viewModel.socialSupportName, isRequired: false)
                
                RequiredTextField(title: "Relationship", text: $viewModel.socialSupportRelationship, isRequired: false)
                
                RequiredTextField(title: "Phone", text: $viewModel.socialSupportPhone, isRequired: false, keyboardType: .phonePad)
            }
            .padding()
        }
    }
    
    // MARK: - Basic Info Section
    
    private var basicInfoSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                sectionHeader(title: "Basic Information", icon: "heart.text.square.fill")
                
                HStack(spacing: 16) {
                    RequiredTextField(title: "Height", text: $viewModel.height, isRequired: true)
                    RequiredTextField(title: "Weight", text: $viewModel.weight, isRequired: true)
                }
                
                Divider().padding(.vertical, 8)
                
                YesNoToggle(title: "Are you currently on dialysis?", isOn: $viewModel.onDialysis, isRequired: true)
                
                if viewModel.onDialysis {
                    RequiredTextField(title: "What type of dialysis?", text: $viewModel.dialysisType, isRequired: false)
                    
                    DatePickerField(title: "Dialysis Start Date", date: $viewModel.dialysisStartDate, isRequired: false)
                }
                
                if !viewModel.onDialysis {
                    RequiredTextField(title: "Last kidney function / GFR", text: $viewModel.lastGFR, isRequired: false)
                }
                
                Divider().padding(.vertical, 8)
                
                YesNoToggle(title: "Do you require any organ in addition to a kidney?", isOn: $viewModel.requiresAdditionalOrgan, isRequired: true)
                
                if viewModel.requiresAdditionalOrgan {
                    RequiredTextField(title: "Specify additional organ(s)", text: $viewModel.additionalOrganDetails, isRequired: false)
                }
            }
            .padding()
        }
    }
    
    // MARK: - Contraindications Section
    
    private var contraindicationsSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                sectionHeader(title: "Contraindications", icon: "exclamationmark.triangle.fill")
                
                Text("Please answer the following questions honestly. This helps your transplant center understand your current health status.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                YesNoToggle(title: "Do you currently have or are you being treated for an infection?", isOn: $viewModel.hasInfection, isRequired: true)
                
                YesNoToggle(title: "Do you currently have or are you being treated for cancer?", isOn: $viewModel.hasCancer, isRequired: true)
                
                YesNoToggle(title: "Do you have any mental health or psychiatric disorders?", isOn: $viewModel.hasMentalHealthDisorder, isRequired: true)
                
                YesNoToggle(title: "Do you smoke, drink alcohol, or use drugs/substances?", isOn: $viewModel.usesSubstances, isRequired: true)
                
                YesNoToggle(title: "Any surgery or procedure in the past 12 months?", isOn: $viewModel.recentSurgery, isRequired: true)
                
                YesNoToggle(title: "Do you use oxygen?", isOn: $viewModel.usesOxygen, isRequired: true)
                
                if viewModel.hasAnyContraindication {
                    Divider().padding(.vertical, 8)
                    
                    Text("Please explain any 'Yes' answers above:")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    TextEditor(text: $viewModel.contraindicationsExplanation)
                        .frame(minHeight: 100)
                        .padding(8)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                }
            }
            .padding()
        }
    }
    
    // MARK: - Medical History Section
    
    private var medicalHistorySection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                sectionHeader(title: "Medical History", icon: "doc.text.fill")
                
                Text("List all diagnosed conditions:")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                TextEditor(text: $viewModel.diagnosedConditions)
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                
                Divider().padding(.vertical, 8)
                
                Text("List all past surgeries/procedures:")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                TextEditor(text: $viewModel.pastSurgeries)
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
            }
            .padding()
        }
    }
    
    // MARK: - Providers Section
    
    private var providersSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                sectionHeader(title: "Healthcare Providers", icon: "stethoscope")
                
                // Dialysis Unit
                Group {
                    Text("Dialysis Unit")
                        .font(.headline)
                    
                    RequiredTextField(title: "Name", text: $viewModel.dialysisUnitName, isRequired: false)
                    RequiredTextField(title: "Address", text: $viewModel.dialysisUnitAddress, isRequired: false)
                    RequiredTextField(title: "Email", text: $viewModel.dialysisUnitEmail, isRequired: false, keyboardType: .emailAddress)
                    RequiredTextField(title: "Phone", text: $viewModel.dialysisUnitPhone, isRequired: false, keyboardType: .phonePad)
                }
                
                Divider().padding(.vertical, 8)
                
                // Social Worker
                Group {
                    Text("Dialysis Unit Social Worker")
                        .font(.headline)
                    
                    RequiredTextField(title: "Name", text: $viewModel.socialWorkerName, isRequired: false)
                    RequiredTextField(title: "Email", text: $viewModel.socialWorkerEmail, isRequired: false, keyboardType: .emailAddress)
                    RequiredTextField(title: "Phone", text: $viewModel.socialWorkerPhone, isRequired: false, keyboardType: .phonePad)
                }
                
                Divider().padding(.vertical, 8)
                
                // Other Physicians
                Group {
                    HStack {
                        Text("Other Physicians")
                            .font(.headline)
                        Spacer()
                        Button(action: { viewModel.addPhysician() }) {
                            Image(systemName: "plus.circle.fill")
                                .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                        }
                    }
                    
                    ForEach(viewModel.otherPhysicians.indices, id: \.self) { index in
                        PhysicianCard(physician: $viewModel.otherPhysicians[index], onDelete: {
                            viewModel.removePhysician(at: index)
                        })
                    }
                    
                    if viewModel.otherPhysicians.isEmpty {
                        Text("Tap + to add a physician (Nephrologist, Cardiologist, PCP, etc.)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color(.systemGray6))
                            .cornerRadius(8)
                    }
                }
            }
            .padding()
        }
    }
    
    // MARK: - Signature Section
    
    private var signatureSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                sectionHeader(title: "Signature", icon: "signature")
                
                Text("By signing below, I confirm that all the information provided in this form is accurate and complete to the best of my knowledge.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                if let signature = viewModel.signatureImage {
                    VStack {
                        Image(uiImage: signature)
                            .resizable()
                            .scaledToFit()
                            .frame(height: 150)
                            .background(Color.white)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(.systemGray4), lineWidth: 1)
                            )
                        
                        Button("Clear Signature") {
                            viewModel.signatureImage = nil
                            viewModel.signatureData = nil
                        }
                        .foregroundColor(.red)
                    }
                } else {
                    Button(action: { showSignaturePad = true }) {
                        HStack {
                            Image(systemName: "pencil.tip")
                            Text("Tap to Sign")
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 150)
                        .background(Color(.systemGray6))
                        .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(.systemGray4), style: StrokeStyle(lineWidth: 1, dash: [5]))
                        )
                    }
                }
                
                Text("Date: \(Date(), style: .date)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.top)
            }
            .padding()
        }
        .sheet(isPresented: $showSignaturePad) {
            SignaturePadView { image, data in
                viewModel.signatureImage = image
                viewModel.signatureData = data
                showSignaturePad = false
            }
        }
    }
    
    // MARK: - Navigation Buttons
    
    private var navigationButtons: some View {
        HStack(spacing: 16) {
            if currentSection > 0 {
                Button(action: { currentSection -= 1 }) {
                    HStack {
                        Image(systemName: "chevron.left")
                        Text("Previous")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color(.systemGray5))
                    .foregroundColor(.primary)
                    .cornerRadius(10)
                }
            }
            
            if currentSection < sections.count - 1 {
                Button(action: { currentSection += 1 }) {
                    HStack {
                        Text("Next")
                        Image(systemName: "chevron.right")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color(red: 0.2, green: 0.6, blue: 0.9))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
            } else {
                Button(action: {
                    if viewModel.validateForm() {
                        showSubmitConfirmation = true
                    }
                }) {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Submit Form")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(viewModel.canSubmit ? Color.green : Color(.systemGray4))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .disabled(!viewModel.canSubmit)
            }
        }
        .padding()
        .background(Color(.systemBackground))
    }
    
    // MARK: - Helper Views
    
    private func sectionHeader(title: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
            
            Text(title)
                .font(.title2)
                .fontWeight(.bold)
        }
        .padding(.bottom, 8)
    }
}

// MARK: - Supporting Views

struct RequiredTextField: View {
    let title: String
    @Binding var text: String
    var isRequired: Bool = false
    var keyboardType: UIKeyboardType = .default
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                if isRequired {
                    Text("*")
                        .foregroundColor(.red)
                }
            }
            
            TextField(title, text: $text)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .keyboardType(keyboardType)
        }
    }
}

struct DatePickerField: View {
    let title: String
    @Binding var date: Date?
    var isRequired: Bool = false
    
    @State private var showPicker = false
    @State private var tempDate = Date()
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                if isRequired {
                    Text("*")
                        .foregroundColor(.red)
                }
            }
            
            Button(action: { showPicker = true }) {
                HStack {
                    Text(date.map { $0.formatted(date: .abbreviated, time: .omitted) } ?? "Select date")
                        .foregroundColor(date == nil ? .secondary : .primary)
                    Spacer()
                    Image(systemName: "calendar")
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }
            .sheet(isPresented: $showPicker) {
                NavigationView {
                    DatePicker("", selection: $tempDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .navigationTitle(title)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") {
                                    date = tempDate
                                    showPicker = false
                                }
                            }
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Cancel") {
                                    showPicker = false
                                }
                            }
                        }
                }
                .presentationDetents([.medium])
            }
        }
    }
}

struct YesNoToggle: View {
    let title: String
    @Binding var isOn: Bool
    var isRequired: Bool = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text(title)
                    .font(.subheadline)
                if isRequired {
                    Text("*")
                        .foregroundColor(.red)
                }
            }
            
            HStack(spacing: 12) {
                Button(action: { isOn = true }) {
                    Text("Yes")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(isOn ? Color(red: 0.2, green: 0.6, blue: 0.9) : Color(.systemGray5))
                        .foregroundColor(isOn ? .white : .primary)
                        .cornerRadius(8)
                }
                
                Button(action: { isOn = false }) {
                    Text("No")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(!isOn ? Color(red: 0.2, green: 0.6, blue: 0.9) : Color(.systemGray5))
                        .foregroundColor(!isOn ? .white : .primary)
                        .cornerRadius(8)
                }
            }
        }
    }
}

struct PhysicianCard: View {
    @Binding var physician: Physician
    let onDelete: () -> Void
    
    let specialties = ["Nephrologist", "Cardiologist", "PCP", "Pulmonologist", "Endocrinologist", "Other"]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Physician")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .foregroundColor(.red)
                }
            }
            
            Picker("Specialty", selection: $physician.specialty) {
                ForEach(specialties, id: \.self) { specialty in
                    Text(specialty).tag(specialty)
                }
            }
            .pickerStyle(.menu)
            
            RequiredTextField(title: "Name", text: $physician.name, isRequired: true)
            RequiredTextField(title: "Address", text: $physician.address, isRequired: false)
            RequiredTextField(title: "Phone", text: $physician.phone, isRequired: false, keyboardType: .phonePad)
            RequiredTextField(title: "Fax", text: $physician.fax, isRequired: false, keyboardType: .phonePad)
            RequiredTextField(title: "Email", text: $physician.email, isRequired: false, keyboardType: .emailAddress)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct LoadingOverlay: View {
    var body: some View {
        ZStack {
            Color.black.opacity(0.3)
                .ignoresSafeArea()
            
            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)
                Text("Saving...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(24)
            .background(Color(.systemBackground))
            .cornerRadius(16)
        }
    }
}

// MARK: - Signature Pad View

struct SignaturePadView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var lines: [[CGPoint]] = []
    @State private var currentLine: [CGPoint] = []
    
    let onComplete: (UIImage, String) -> Void
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Sign with your finger below")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.top)
                
                Canvas { context, size in
                    for line in lines {
                        var path = Path()
                        if let firstPoint = line.first {
                            path.move(to: firstPoint)
                            for point in line.dropFirst() {
                                path.addLine(to: point)
                            }
                        }
                        context.stroke(path, with: .color(.black), lineWidth: 2)
                    }
                    
                    var currentPath = Path()
                    if let firstPoint = currentLine.first {
                        currentPath.move(to: firstPoint)
                        for point in currentLine.dropFirst() {
                            currentPath.addLine(to: point)
                        }
                    }
                    context.stroke(currentPath, with: .color(.black), lineWidth: 2)
                }
                .background(Color.white)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(.systemGray4), lineWidth: 1)
                )
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            currentLine.append(value.location)
                        }
                        .onEnded { _ in
                            lines.append(currentLine)
                            currentLine = []
                        }
                )
                .padding()
                
                HStack {
                    Button("Clear") {
                        lines = []
                        currentLine = []
                    }
                    .foregroundColor(.red)
                    
                    Spacer()
                }
                .padding(.horizontal)
            }
            .navigationTitle("Signature")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        if let image = renderSignature() {
                            if let data = image.pngData() {
                                let base64 = data.base64EncodedString()
                                onComplete(image, base64)
                            }
                        }
                    }
                    .disabled(lines.isEmpty)
                }
            }
        }
    }
    
    private func renderSignature() -> UIImage? {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 400, height: 200))
        return renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 400, height: 200))
            
            UIColor.black.setStroke()
            
            for line in lines {
                let path = UIBezierPath()
                if let firstPoint = line.first {
                    path.move(to: firstPoint)
                    for point in line.dropFirst() {
                        path.addLine(to: point)
                    }
                }
                path.lineWidth = 2
                path.stroke()
            }
        }
    }
}

// MARK: - Preview

struct IntakeFormView_Previews: PreviewProvider {
    static var previews: some View {
        IntakeFormView()
    }
}
