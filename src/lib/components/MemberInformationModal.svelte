<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { MemberPatient } from '$lib/patientProfile.js';
  import {
    formatDateDisplay,
    formatGenderDisplay,
    getCheckedConditionsDisplay,
    getFamilyHistoryDisplay
  } from '$lib/patientProfile.js';

  export let patient: MemberPatient | null = null;
  export let open = false;

  function handleClose() {
    open = false;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  $: if (open && typeof document !== 'undefined') {
    document.body.style.overflow = 'hidden';
  }

  $: fullName = patient
    ? [patient.name, patient.middleName, patient.lastName, patient.suffix].filter(Boolean).join(' ')
    : '';
</script>

{#if open && patient}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    on:click={handleClose}
    transition:fade={{ duration: 300 }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel" on:click|stopPropagation transition:scale={{ duration: 300, start: 0.9, opacity: 0 }}>
      <div class="modal-header">
        <h2>Member Information</h2>
        <button type="button" class="close-btn" on:click={handleClose} aria-label="Close member details">
          <svg class="close-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="profile-section">
          <div class="profile-avatar">
            {#if patient.profileImage}
              <img src={patient.profileImage} alt="Profile" class="profile-image" />
            {:else}
              <div class="profile-placeholder">
                {patient.name?.charAt(0).toUpperCase()}{patient.lastName?.charAt(0).toUpperCase()}
              </div>
            {/if}
          </div>
          <div class="profile-info">
            <h3>{fullName}</h3>
            <p class="member-id">Member ID: {patient.displayId || patient.id}</p>
            <span class="status-pill {patient.status === 'inactive' ? 'inactive' : 'active'}">
              {patient.status === 'inactive' ? 'Inactive' : 'Active'}
            </span>
          </div>
        </div>

        <div class="info-section">
          <h4 class="section-title">Personal Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Age:</span>
              <span class="info-value">{patient.age || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Birthday:</span>
              <span class="info-value">{formatDateDisplay(patient.birthday)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Gender:</span>
              <span class="info-value">{formatGenderDisplay(patient.gender)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Phone:</span>
              {#if patient.phone && patient.phone !== 'N/A'}
                <a href="tel:{patient.phone}" class="info-value phone-link">{patient.phone}</a>
              {:else}
                <span class="info-value">N/A</span>
              {/if}
            </div>
            <div class="info-item full-width">
              <span class="info-label">Email:</span>
              <span class="info-value">{patient.email || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Registered:</span>
              <span class="info-value">{formatDateDisplay(patient.registrationDate)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Status:</span>
              <span class="info-value">{patient.status === 'inactive' ? 'Inactive' : 'Active'}</span>
            </div>
          </div>
        </div>

        <div class="info-section">
          <h4 class="section-title">Medical Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Blood Type:</span>
              <span class="info-value">{patient.bloodType || 'Not specified'}</span>
            </div>
            <div class="info-item full-width">
              <span class="info-label">Allergies:</span>
              <span class="info-value">{patient.allergies || 'None reported'}</span>
            </div>
            <div class="info-item full-width">
              <span class="info-label">Current Medications:</span>
              <span class="info-value">{patient.currentMedications || 'None reported'}</span>
            </div>
          </div>
        </div>

        {#if patient.medicalConditions && Object.keys(patient.medicalConditions).length > 0}
          {@const conditions = getCheckedConditionsDisplay(patient.medicalConditions)}
          {#if conditions.length > 0}
            <div class="info-section">
              <h4 class="section-title">Medical Conditions</h4>
              <div class="tag-list">
                {#each conditions as condition}
                  <span class="tag tag-blue">{condition}</span>
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        {#if getCheckedConditionsDisplay((patient.surgicalHistoryItems && patient.surgicalHistoryItems.length > 0) ? patient.surgicalHistoryItems : patient.surgicalHistory).length > 0}
          <div class="info-section">
            <h4 class="section-title">Surgical History</h4>
            <div class="tag-list">
              {#each getCheckedConditionsDisplay((patient.surgicalHistoryItems && patient.surgicalHistoryItems.length > 0) ? patient.surgicalHistoryItems : patient.surgicalHistory) as surgery}
                <span class="tag tag-amber">{surgery}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if getFamilyHistoryDisplay(patient).length > 0}
          <div class="info-section">
            <h4 class="section-title">Family History</h4>
            <div class="family-list">
              {#each getFamilyHistoryDisplay(patient) as item}
                <div class="family-item">
                  <strong>{item.relative}:</strong>
                  <span>{item.conditions.join(', ')}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if patient.otherMedicalConditions || patient.otherSurgicalHistory || patient.otherRelativeSpecify || patient.otherFamilyHistory || patient.bloodTransfusionHistory}
          <div class="info-section">
            <h4 class="section-title">Additional Medical Information</h4>
            <div class="info-grid">
              {#if patient.otherMedicalConditions}
                <div class="info-item full-width">
                  <span class="info-label">Other Medical Conditions:</span>
                  <span class="info-value">{patient.otherMedicalConditions}</span>
                </div>
              {/if}
              {#if patient.otherFamilyHistory}
                <div class="info-item full-width">
                  <span class="info-label">Other Family History:</span>
                  <span class="info-value">{patient.otherFamilyHistory}</span>
                </div>
              {/if}
              {#if patient.otherSurgicalHistory}
                <div class="info-item full-width">
                  <span class="info-label">Other Surgeries:</span>
                  <span class="info-value">{patient.otherSurgicalHistory}</span>
                </div>
              {/if}
              {#if patient.otherRelativeSpecify}
                <div class="info-item full-width">
                  <span class="info-label">Other Relative Notes:</span>
                  <span class="info-value">{patient.otherRelativeSpecify}</span>
                </div>
              {/if}
              {#if patient.bloodTransfusionHistory}
                <div class="info-item full-width">
                  <span class="info-label">Blood Transfusion History:</span>
                  <span class="info-value">{patient.bloodTransfusionHistory}</span>
                </div>
              {/if}
              {#if patient.bloodTransfusionDate}
                <div class="info-item full-width">
                  <span class="info-label">Blood Transfusion Date:</span>
                  <span class="info-value">{formatDateDisplay(patient.bloodTransfusionDate)}</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <div class="modal-footer">
          <button type="button" class="close-action-btn" on:click={handleClose}>Close</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1300;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.5);
  }

  .modal-panel {
    background: white;
    border-radius: 1rem;
    width: 100%;
    max-width: 56rem;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .modal-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: #1e3a66;
    color: white;
    border-radius: 1rem 1rem 0 0;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    transition: background 0.2s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .close-icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  .modal-body {
    padding: 1.5rem;
  }

  .profile-section {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 2px solid #f3f4f6;
  }

  .profile-avatar {
    flex-shrink: 0;
  }

  .profile-image,
  .profile-placeholder {
    width: 6rem;
    height: 6rem;
    border-radius: 50%;
    border: 4px solid #bfdbfe;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .profile-image {
    object-fit: cover;
  }

  .profile-placeholder {
    background: #1e3a66;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .profile-info h3 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
  }

  .member-id {
    margin: 0.25rem 0 0.5rem;
    color: #6b7280;
    font-size: 0.95rem;
  }

  .status-pill {
    display: inline-block;
    padding: 0.2rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .status-pill.active {
    background: #dcfce7;
    color: #166534;
  }

  .status-pill.inactive {
    background: #fee2e2;
    color: #b91c1c;
  }

  .info-section {
    margin-bottom: 1.5rem;
  }

  .section-title {
    margin: 0 0 0.75rem;
    font-size: 1.125rem;
    font-weight: 700;
    color: #1e3a8a;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #dbeafe;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-item.full-width {
    grid-column: 1 / -1;
  }

  .info-label {
    font-weight: 600;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .info-value {
    font-size: 0.95rem;
    color: #1f2937;
    word-break: break-word;
  }

  .phone-link {
    color: #2563eb;
    text-decoration: none;
  }

  .phone-link:hover {
    text-decoration: underline;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .tag-blue {
    background: #dbeafe;
    color: #1e40af;
  }

  .tag-amber {
    background: #fef3c7;
    color: #92400e;
  }

  .family-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .family-item {
    background: #f9fafb;
    padding: 0.75rem;
    border-radius: 0.5rem;
    border-left: 4px solid #3b82f6;
    color: #374151;
  }

  .family-item strong {
    color: #1f2937;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 2px solid #f3f4f6;
  }

  .close-action-btn {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: none;
    background: #2563eb;
    color: white;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .close-action-btn:hover {
    background: #1d4ed8;
  }

  @media (max-width: 640px) {
    .info-grid {
      grid-template-columns: 1fr;
    }

    .profile-section {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
