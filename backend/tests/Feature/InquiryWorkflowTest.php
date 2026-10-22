<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesApiUsers;
use Tests\TestCase;

class InquiryWorkflowTest extends TestCase
{
    use AuthenticatesApiUsers, RefreshDatabase;

    public function test_marketing_records_and_sales_converts_an_inquiry(): void
    {
        $marketing = $this->createUser(RoleName::Marketing);
        $sales = $this->createUser(RoleName::Sales);

        $create = $this->withHeaders($this->tokenHeaders($marketing))
            ->postJson('/api/v1/inquiries', [
                'lead_name' => 'Alex Franchisee',
                'email' => 'alex@example.test',
                'phone' => '09171234567',
                'source' => 'facebook',
                'remarks' => 'Interested in a kiosk package.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'new');

        $inquiryId = $create->json('data.id');

        $this->withHeaders($this->tokenHeaders($marketing))
            ->postJson("/api/v1/inquiries/{$inquiryId}/endorse", [
                'endorsed_to_user_id' => $sales->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'endorsed');

        $this->withHeaders($this->tokenHeaders($sales))
            ->postJson("/api/v1/inquiries/{$inquiryId}/convert", [])
            ->assertCreated()
            ->assertJsonPath('data.full_name', 'Alex Franchisee')
            ->assertJsonPath('data.status', 'inquiry');

        $this->assertDatabaseHas('franchise_inquiries', [
            'id' => $inquiryId,
            'status' => 'converted',
        ]);
        $this->assertDatabaseHas('applicants', [
            'inquiry_id' => $inquiryId,
            'email' => 'alex@example.test',
        ]);
    }


    public function test_marketing_can_endorse_to_the_default_active_admin(): void
    {
        $marketing = $this->createUser(RoleName::Marketing);
        $admin = $this->createUser(RoleName::Admin);

        $create = $this->withHeaders($this->tokenHeaders($marketing))
            ->postJson('/api/v1/inquiries', [
                'lead_name' => 'Default Assignment Lead',
                'source' => 'referral',
            ])
            ->assertCreated();

        $inquiryId = $create->json('data.id');

        $this->withHeaders($this->tokenHeaders($marketing))
            ->postJson("/api/v1/inquiries/{$inquiryId}/endorse", [])
            ->assertOk()
            ->assertJsonPath('data.status', 'endorsed')
            ->assertJsonPath('data.endorsed_to_user_id', $admin->id);
    }

    public function test_franchisee_role_cannot_create_inquiries(): void
    {
        $franchisee = $this->createUser(RoleName::Franchisee);

        $this->withHeaders($this->tokenHeaders($franchisee))
            ->postJson('/api/v1/inquiries', [
                'lead_name' => 'Blocked User',
                'source' => 'walk_in',
            ])
            ->assertForbidden();
    }
}
